/**
 * User trust evaluation.
 *
 * Computes a trust score (0–100) for each user based on:
 *   1. Account age on their PDS (not on Backyard)
 *   2. Whether they have records from other AT Protocol apps
 *   3. Posting frequency (looking for spam patterns)
 *
 * Accounts with a score >= TRUST_THRESHOLD have their media rendered normally.
 * Below that threshold, media is hidden until the account gains trust or an
 * admin manually approves them.
 *
 * No preferential treatment is given to any particular PDS.
 */

import pool from './db.js';
import { resolveDidDocument, getPdsUrl } from './identity.js';

const TRUST_THRESHOLD = 50;
const TRUST_TTL_MS = 6 * 60 * 60 * 1000; // re-evaluate every 6 hours

// ─── Score component weights ─────────────────────────────────────────

const AGE_MAX = 40;
const EXTERNAL_MAX = 30;
const FREQUENCY_MAX = 30;

// ─── Account age brackets (in days → points) ────────────────────────

function ageScore(createdAt: Date | null): number {
	if (!createdAt) return 0;
	const ageDays = (Date.now() - createdAt.getTime()) / (1000 * 60 * 60 * 24);
	if (ageDays >= 90) return AGE_MAX;
	if (ageDays >= 30) return 30;
	if (ageDays >= 7) return 20;
	if (ageDays >= 1) return 10;
	return 0;
}

function externalRecordsScore(hasExternal: boolean): number {
	return hasExternal ? EXTERNAL_MAX : 0;
}

/**
 * Score posting frequency. Normal or no activity = full points.
 * Suspiciously high volume in a short window = 0.
 */
function frequencyScore(postCount30d: number, accountAgeDays: number): number {
	if (postCount30d === 0) return FREQUENCY_MAX;

	// For very new accounts (< 1 day), even a few posts are fine, but
	// more than ~20 in the first day looks suspicious.
	if (accountAgeDays < 1) {
		return postCount30d <= 10 ? FREQUENCY_MAX : postCount30d <= 20 ? 15 : 0;
	}

	const postsPerDay = postCount30d / Math.min(accountAgeDays, 30);
	if (postsPerDay <= 10) return FREQUENCY_MAX;
	if (postsPerDay <= 30) return 15;
	return 0;
}

// ─── PDS account creation date ───────────────────────────────────────

/**
 * Resolve when a DID was originally created on its PDS.
 *
 * - did:plc: → PLC directory audit log (first operation timestamp)
 * - did:web: → no standardised creation date; fall back to our first record
 */
async function resolveAccountCreatedAt(did: string): Promise<Date | null> {
	if (did.startsWith('did:plc:')) {
		try {
			const res = await fetch(`https://plc.directory/${did}/log/audit`);
			if (res.ok) {
				const log: { createdAt: string }[] = await res.json();
				if (log.length > 0 && log[0].createdAt) {
					return new Date(log[0].createdAt);
				}
			}
		} catch {
			// Fall through
		}
	}

	// Fallback: use the earliest timestamp we have in our local DB
	try {
		const result = await pool.query(
			'SELECT updated_at FROM profiles WHERE did = $1',
			[did]
		);
		if (result.rows[0]?.updated_at) {
			return new Date(result.rows[0].updated_at);
		}
	} catch {
		// Non-fatal
	}

	return null;
}

// ─── External records detection ──────────────────────────────────────

/**
 * Check whether the user has records from other AT Protocol applications
 * (e.g. Bluesky). Queries the user's PDS for a small set of well-known
 * collections.
 */
const EXTERNAL_COLLECTIONS = [
	'app.bsky.feed.post',
	'app.bsky.graph.follow',
	'app.bsky.actor.profile'
];

async function checkExternalRecords(did: string): Promise<boolean> {
	let pdsUrl: string | undefined;
	try {
		const didDoc = await resolveDidDocument(did);
		pdsUrl = getPdsUrl(didDoc);
	} catch {
		return false;
	}
	if (!pdsUrl) return false;

	for (const collection of EXTERNAL_COLLECTIONS) {
		try {
			const res = await fetch(
				`${pdsUrl}/xrpc/com.atproto.repo.listRecords?` +
					`repo=${encodeURIComponent(did)}&` +
					`collection=${encodeURIComponent(collection)}&limit=1`
			);
			if (res.ok) {
				const data = await res.json();
				if (data.records && data.records.length > 0) {
					return true;
				}
			}
		} catch {
			continue;
		}
	}

	return false;
}

// ─── Local posting frequency ─────────────────────────────────────────

async function countRecentPosts(did: string): Promise<number> {
	const result = await pool.query(
		"SELECT COUNT(*)::int AS cnt FROM posts WHERE author_did = $1 AND created_at > NOW() - INTERVAL '30 days'",
		[did]
	);
	return result.rows[0]?.cnt ?? 0;
}

// ─── Public API ──────────────────────────────────────────────────────

export interface TrustEvaluation {
	did: string;
	trustScore: number;
	mediaTrusted: boolean;
	manuallyApproved: boolean;
	accountCreatedAt: string | null;
	hasExternalRecords: boolean;
	postCount30d: number;
	evaluatedAt: string;
}

/**
 * Evaluate (or re-evaluate) trust for a user. Stores the result in the
 * `account_trust` table and updates the `profiles.media_trusted` column.
 */
export async function evaluateTrust(did: string): Promise<TrustEvaluation> {
	// Check if manually approved first — skip expensive network checks
	const existing = await pool.query(
		'SELECT manually_approved FROM account_trust WHERE did = $1',
		[did]
	);
	const manuallyApproved = existing.rows[0]?.manually_approved === true;

	let accountCreatedAt: Date | null = null;
	let hasExternalRecords = false;
	let postCount30d = 0;
	let score = 0;

	if (manuallyApproved) {
		score = 100;
		// Still gather data for visibility, but don't let it reduce score
		try { accountCreatedAt = await resolveAccountCreatedAt(did); } catch { /* non-fatal */ }
		try { hasExternalRecords = await checkExternalRecords(did); } catch { /* non-fatal */ }
		try { postCount30d = await countRecentPosts(did); } catch { /* non-fatal */ }
	} else {
		// Gather signals — each call is best-effort
		const [age, ext, posts] = await Promise.allSettled([
			resolveAccountCreatedAt(did),
			checkExternalRecords(did),
			countRecentPosts(did)
		]);

		accountCreatedAt = age.status === 'fulfilled' ? age.value : null;
		hasExternalRecords = ext.status === 'fulfilled' ? ext.value : false;
		postCount30d = posts.status === 'fulfilled' ? posts.value : 0;

		const accountAgeDays = accountCreatedAt
			? (Date.now() - accountCreatedAt.getTime()) / (1000 * 60 * 60 * 24)
			: 0;

		score =
			ageScore(accountCreatedAt) +
			externalRecordsScore(hasExternalRecords) +
			frequencyScore(postCount30d, accountAgeDays);
	}

	const mediaTrusted = score >= TRUST_THRESHOLD;

	await pool.query(
		`INSERT INTO account_trust (did, trust_score, manually_approved, account_created_at, has_external_records, post_count_30d, evaluated_at)
		 VALUES ($1, $2, $3, $4, $5, $6, NOW())
		 ON CONFLICT (did) DO UPDATE SET
		   trust_score = $2,
		   account_created_at = COALESCE($4, account_trust.account_created_at),
		   has_external_records = $5,
		   post_count_30d = $6,
		   evaluated_at = NOW()`,
		[did, score, manuallyApproved, accountCreatedAt, hasExternalRecords, postCount30d]
	);

	// Denormalise into profiles for fast feed rendering
	await pool.query(
		'UPDATE profiles SET media_trusted = $2 WHERE did = $1',
		[did, mediaTrusted]
	);

	return {
		did,
		trustScore: score,
		mediaTrusted,
		manuallyApproved,
		accountCreatedAt: accountCreatedAt?.toISOString() ?? null,
		hasExternalRecords,
		postCount30d,
		evaluatedAt: new Date().toISOString()
	};
}

/**
 * Get the cached trust status for a user. If stale or missing, triggers a
 * background re-evaluation and returns the current (possibly stale) result
 * to avoid blocking the request.
 */
export async function getTrustStatus(did: string): Promise<TrustEvaluation> {
	const result = await pool.query(
		'SELECT * FROM account_trust WHERE did = $1',
		[did]
	);

	if (result.rows.length > 0) {
		const row = result.rows[0];
		const age = Date.now() - new Date(row.evaluated_at).getTime();

		if (age > TRUST_TTL_MS) {
			// Stale — re-evaluate in background, return current value
			evaluateTrust(did).catch((err) =>
				console.error(`Background trust re-evaluation failed for ${did}:`, err)
			);
		}

		return {
			did: row.did,
			trustScore: row.trust_score,
			mediaTrusted: row.trust_score >= TRUST_THRESHOLD || row.manually_approved,
			manuallyApproved: row.manually_approved,
			accountCreatedAt: row.account_created_at?.toISOString() ?? null,
			hasExternalRecords: row.has_external_records,
			postCount30d: row.post_count_30d,
			evaluatedAt: row.evaluated_at.toISOString()
		};
	}

	// No evaluation yet — perform one now
	return evaluateTrust(did);
}

/**
 * Quick boolean check: is a user's media trusted?
 * Prefers the denormalised `profiles.media_trusted` column for speed.
 */
export async function isMediaTrusted(did: string): Promise<boolean> {
	// Fast path: check profiles cache
	const profileResult = await pool.query(
		'SELECT media_trusted FROM profiles WHERE did = $1',
		[did]
	);
	if (profileResult.rows.length > 0) {
		return profileResult.rows[0].media_trusted === true;
	}

	// Fallback: check trust table directly
	const trustResult = await pool.query(
		'SELECT trust_score, manually_approved FROM account_trust WHERE did = $1',
		[did]
	);
	if (trustResult.rows.length > 0) {
		const row = trustResult.rows[0];
		return row.trust_score >= TRUST_THRESHOLD || row.manually_approved;
	}

	// Never evaluated — trigger evaluation
	const evaluation = await evaluateTrust(did);
	return evaluation.mediaTrusted;
}

/**
 * Admin: manually approve an account, immediately marking their media as trusted.
 */
export async function setManualApproval(did: string, approved: boolean): Promise<void> {
	await pool.query(
		`INSERT INTO account_trust (did, trust_score, manually_approved, evaluated_at)
		 VALUES ($1, $2, $3, NOW())
		 ON CONFLICT (did) DO UPDATE SET
		   manually_approved = $3,
		   trust_score = CASE WHEN $3 THEN 100 ELSE account_trust.trust_score END,
		   evaluated_at = NOW()`,
		[did, approved ? 100 : 0, approved]
	);

	const mediaTrusted = approved || (await (async () => {
		const r = await pool.query('SELECT trust_score FROM account_trust WHERE did = $1', [did]);
		return (r.rows[0]?.trust_score ?? 0) >= TRUST_THRESHOLD;
	})());

	await pool.query(
		'UPDATE profiles SET media_trusted = $2 WHERE did = $1',
		[did, mediaTrusted]
	);
}

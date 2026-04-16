/**
 * Backfill module — discovers and indexes blue.backyard.* records.
 *
 * Two modes:
 *
 * 1. **Network discovery** — queries a Rainbow-compatible service (e.g. bsky.network)
 *    via `com.atproto.sync.listReposByCollection` to find every DID that has
 *    records in our collections, then backfills each one. Called at startup.
 *
 * 2. **Per-user** — uses `com.atproto.repo.listRecords` to fetch all records
 *    from a single user's PDS. Called on login and on-demand profile views.
 *
 * All DB writes use upsert semantics — backfill is idempotent and safe to
 * call repeatedly.
 */

import pool from './db.js';
import { NSID, ALL_NSIDS } from '$lib/lexicon.js';
import { ensureProfile, resolveDidDocument, getPdsUrl } from './identity.js';
import {
	clampText,
	clampTags,
	clampJson,
	safeIsoDate,
	resolveRootPostUri,
	isValidDid,
	MAX_TEXT_LENGTH
} from './validation.js';

const RAINBOW_URL = process.env.RAINBOW_URL || 'https://bsky.network';
const RELAY_RETRY_BASE_MS = 5_000;
const RELAY_RETRY_MAX_MS = 5 * 60_000;
const RELAY_MAX_ATTEMPTS = 10;

/**
 * Collections to backfill, in dependency order.
 * Posts first (so reblogs/comments can resolve root_post_uri),
 * then reblogs, comments, likes, follows.
 */
const BACKFILL_COLLECTIONS = [
	NSID.PROFILE,
	NSID.POST,
	NSID.REBLOG,
	NSID.COMMENT,
	NSID.LIKE,
	NSID.FOLLOW,
	NSID.BLOCK
] as const;

/** Track in-flight backfills to avoid duplicate work */
const activeBackfills = new Set<string>();

/** Track recently-backfilled DIDs to avoid redundant re-backfills */
const backfillCache = new Map<string, number>();
const BACKFILL_COOLDOWN_MS = 30 * 60 * 1000; // 30 minutes

interface ListRecordsResponse {
	records: {
		uri: string;
		cid: string;
		value: Record<string, unknown>;
	}[];
	cursor?: string;
}

interface LatestCommitResponse {
	cid: string;
	rev: string;
}

/**
 * Fetch the latest commit revision for a repo from a user's PDS via
 * com.atproto.sync.getLatestCommit. Returns the rev (a TID — a
 * lexicographically sortable timestamp), or null on failure.
 */
async function getLatestCommit(pdsUrl: string, did: string): Promise<string | null> {
	try {
		const url = new URL(`${pdsUrl}/xrpc/com.atproto.sync.getLatestCommit`);
		url.searchParams.set('did', did);
		const res = await fetch(url.toString());
		if (!res.ok) return null;
		const data = (await res.json()) as LatestCommitResponse;
		return data.rev || null;
	} catch {
		return null;
	}
}

/**
 * Fetch all records in a collection from a user's PDS via
 * com.atproto.repo.listRecords, paginating through all pages.
 */
async function listAllRecords(
	pdsUrl: string,
	did: string,
	collection: string
): Promise<ListRecordsResponse['records']> {
	const all: ListRecordsResponse['records'] = [];
	let cursor: string | undefined;
	const limit = 100;

	do {
		const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
		url.searchParams.set('repo', did);
		url.searchParams.set('collection', collection);
		url.searchParams.set('limit', limit.toString());
		if (cursor) url.searchParams.set('cursor', cursor);

		const res = await fetch(url.toString());
		if (!res.ok) {
			// 400 likely means the collection doesn't exist in this repo — that's fine
			if (res.status === 400) break;
			throw new Error(`listRecords ${collection} returned ${res.status}`);
		}

		const data = (await res.json()) as ListRecordsResponse;
		all.push(...data.records);
		cursor = data.cursor;
	} while (cursor);

	return all;
}

/**
 * Map collection NSIDs to their local database table and author column.
 */
const COLLECTION_TABLE: Record<string, { table: string; authorCol: string }> = {
	[NSID.POST]: { table: 'posts', authorCol: 'author_did' },
	[NSID.COMMENT]: { table: 'comments', authorCol: 'author_did' },
	[NSID.REBLOG]: { table: 'reblogs', authorCol: 'author_did' },
	[NSID.LIKE]: { table: 'likes', authorCol: 'author_did' },
	[NSID.FOLLOW]: { table: 'follows', authorCol: 'author_did' },
	[NSID.BLOCK]: { table: 'blocks', authorCol: 'author_did' }
};

/**
 * Delete local records that no longer exist on the user's PDS.
 * Compares the set of URIs fetched from listRecords against what we have
 * locally, and removes any stale rows.
 */
async function removeStaleRecords(
	did: string,
	collection: string,
	pdsUris: Set<string>
): Promise<number> {
	const mapping = COLLECTION_TABLE[collection];
	if (!mapping) return 0;

	const { table, authorCol } = mapping;
	const localResult = await pool.query(
		`SELECT uri FROM ${table} WHERE ${authorCol} = $1`,
		[did]
	);

	const staleUris = localResult.rows
		.map((row: { uri: string }) => row.uri)
		.filter((uri: string) => !pdsUris.has(uri));

	if (staleUris.length === 0) return 0;

	await pool.query(
		`DELETE FROM ${table} WHERE uri = ANY($1::text[])`,
		[staleUris]
	);

	return staleUris.length;
}

/**
 * Index a single record fetched via listRecords, mirroring the firehose
 * indexRecord logic but working from the listRecords response shape.
 */
async function indexBackfillRecord(
	did: string,
	collection: string,
	uri: string,
	cid: string,
	record: Record<string, unknown>
): Promise<void> {
	const r = record;

	switch (collection) {
		case NSID.PROFILE: {
			// Profile is handled by ensureProfile — skip direct indexing
			break;
		}
		case NSID.POST: {
			await pool.query(
				`INSERT INTO posts (uri, cid, author_did, tags, content, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, tags = EXCLUDED.tags, content = EXCLUDED.content`,
				[
					uri,
					cid,
					did,
					clampTags(r.tags),
					clampJson(r.content),
					safeIsoDate(r.createdAt)
				]
			);
			break;
		}
		case NSID.COMMENT: {
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			const root = r.root as { uri?: string; cid?: string } | undefined;
			const parent = r.parent as { uri?: string; cid?: string } | undefined;
			await pool.query(
				`INSERT INTO comments (uri, cid, author_did, text, facets, subject_uri, root_uri, parent_uri, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, text = EXCLUDED.text, facets = EXCLUDED.facets`,
				[
					uri,
					cid,
					did,
					clampText(r.text, MAX_TEXT_LENGTH),
					clampJson(r.facets),
					subject?.uri || '',
					root?.uri || subject?.uri || '',
					parent?.uri || null,
					safeIsoDate(r.createdAt)
				]
			);
			break;
		}
		case NSID.REBLOG: {
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			const subjectUri = subject?.uri || '';
			const rootPostUri = await resolveRootPostUri(subjectUri);

			await pool.query(
				`INSERT INTO reblogs (uri, cid, author_did, subject_uri, root_post_uri, tags, content, created_at)
				 VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
				 ON CONFLICT (uri) DO UPDATE SET
				   cid = EXCLUDED.cid, tags = EXCLUDED.tags, content = EXCLUDED.content,
				   root_post_uri = EXCLUDED.root_post_uri`,
				[
					uri,
					cid,
					did,
					subjectUri,
					rootPostUri,
					clampTags(r.tags),
					clampJson(r.content),
					safeIsoDate(r.createdAt)
				]
			);
			break;
		}
		case NSID.LIKE: {
			const subject = r.subject as { uri?: string; cid?: string } | undefined;
			await pool.query(
				`INSERT INTO likes (uri, cid, author_did, subject_uri, created_at)
				 VALUES ($1, $2, $3, $4, $5)
				 ON CONFLICT (uri) DO NOTHING`,
				[uri, cid, did, subject?.uri || '', safeIsoDate(r.createdAt)]
			);
			break;
		}
		case NSID.FOLLOW: {
			const subjectDid = r.subject as string | undefined;
			if (subjectDid && isValidDid(subjectDid)) {
				await pool.query(
					`INSERT INTO follows (uri, author_did, subject_did, created_at)
					 VALUES ($1, $2, $3, $4)
					 ON CONFLICT (author_did, subject_did) DO NOTHING`,
					[uri, did, subjectDid, safeIsoDate(r.createdAt)]
				);
			}
			break;
		}
		case NSID.BLOCK: {
			const subjectDid = r.subject as string | undefined;
			if (subjectDid && isValidDid(subjectDid)) {
				await pool.query(
					`INSERT INTO blocks (uri, author_did, subject_did, created_at)
					 VALUES ($1, $2, $3, $4)
					 ON CONFLICT (author_did, subject_did) DO NOTHING`,
					[uri, did, subjectDid, safeIsoDate(r.createdAt)]
				);
			}
			break;
		}
	}
}

/**
 * Backfill all blue.backyard.* records from a user's PDS into the local
 * database. Safe to call concurrently — duplicate calls for the same DID
 * are deduplicated.
 *
 * @param did - The user's DID to backfill
 * @returns The number of records indexed, or -1 if skipped
 */
export async function backfillUser(did: string): Promise<number> {
	// Skip if already in progress or recently completed
	if (activeBackfills.has(did)) return -1;

	const lastBackfill = backfillCache.get(did);
	if (lastBackfill && Date.now() - lastBackfill < BACKFILL_COOLDOWN_MS) return -1;

	activeBackfills.add(did);
	let totalRecords = 0;

	try {
		// Resolve PDS URL
		const didDoc = await resolveDidDocument(did);
		const pdsUrl = getPdsUrl(didDoc);
		if (!pdsUrl) {
			console.warn(`Backfill: no PDS URL found for ${did}`);
			return 0;
		}

		// Check the PDS's current repo revision before fetching records.
		// If our stored rev is already >= the PDS rev, the repo hasn't
		// changed since our last sync — skip the backfill entirely.
		const pdsRev = await getLatestCommit(pdsUrl, did);
		if (pdsRev) {
			const stored = await pool.query(
				'SELECT rev FROM repo_revs WHERE did = $1',
				[did]
			);
			if (stored.rows.length > 0 && stored.rows[0].rev >= pdsRev) {
				backfillCache.set(did, Date.now());
				return -1;
			}
		}

		// Ensure profile is indexed first
		await ensureProfile(did);

		// Fetch and index all collections in order, then remove stale records
		for (const collection of BACKFILL_COLLECTIONS) {
			if (collection === NSID.PROFILE) continue; // handled by ensureProfile

			try {
				const records = await listAllRecords(pdsUrl, did, collection);
				const pdsUris = new Set<string>();

				for (const record of records) {
					pdsUris.add(record.uri);
					try {
						await indexBackfillRecord(
							did,
							collection,
							record.uri,
							record.cid,
							record.value
						);
						totalRecords++;
					} catch (err) {
						console.error(`Backfill: failed to index ${record.uri}:`, err);
					}
				}

				// Remove records that exist locally but not on the PDS
				await removeStaleRecords(did, collection, pdsUris);
			} catch (err) {
				console.error(`Backfill: failed to list ${collection} for ${did}:`, err);
			}
		}

		// Store the rev we synced at. Use a conditional update so we never
		// roll back a rev that the firehose has already advanced past.
		if (pdsRev) {
			await pool.query(
				`INSERT INTO repo_revs (did, rev, updated_at)
				 VALUES ($1, $2, NOW())
				 ON CONFLICT (did) DO UPDATE
				   SET rev = EXCLUDED.rev, updated_at = NOW()
				   WHERE repo_revs.rev < EXCLUDED.rev`,
				[did, pdsRev]
			);
		}

		backfillCache.set(did, Date.now());
	} catch (err) {
		console.error(`Backfill: failed for ${did}:`, err);
	} finally {
		activeBackfills.delete(did);
	}

	return totalRecords;
}

/**
 * Check if a user needs backfilling (i.e. we have their profile but no posts).
 * If so, triggers a background backfill.
 */
export async function backfillIfNeeded(did: string): Promise<void> {
	// Quick check: do we have any posts for this user?
	const result = await pool.query(
		'SELECT 1 FROM posts WHERE author_did = $1 LIMIT 1',
		[did]
	);

	if (result.rows.length === 0) {
		// No posts in DB — backfill in background
		backfillUser(did).catch((err) => {
			console.error(`Background backfill error for ${did}:`, err);
		});
	}
}

/* ── Relay-based network discovery ─────────────────────── */

interface ListReposByCollectionResponse {
	repos: { did: string }[];
	cursor?: string;
}

/**
 * Query a relay for all DIDs that have records in the given collection
 * via `com.atproto.sync.listReposByCollection`. Paginates through all pages.
 */
async function listReposByCollection(collection: string): Promise<string[]> {
	const dids: string[] = [];
	let cursor: string | undefined;
	const limit = 2000;

	do {
		const url = new URL(`${RAINBOW_URL}/xrpc/com.atproto.sync.listReposByCollection`);
		url.searchParams.set('collection', collection);
		url.searchParams.set('limit', limit.toString());
		if (cursor) url.searchParams.set('cursor', cursor);

		const res = await fetch(url.toString());
		if (!res.ok) {
			console.error(`listReposByCollection ${collection} returned ${res.status}`);
			break;
		}

		const data = (await res.json()) as ListReposByCollectionResponse;
		for (const repo of data.repos) {
			dids.push(repo.did);
		}
		cursor = data.cursor;
	} while (cursor);

	return dids;
}

/** Track whether a network-wide discovery is already running */
let discoveryRunning = false;

/**
 * Discover all repos with blue.backyard.* records via the relay and
 * backfill each one. Intended to run at startup to populate a fresh or
 * stale database. Runs in the background — does not block the caller.
 */
export async function discoverAndBackfill(): Promise<void> {
	if (discoveryRunning) return;
	discoveryRunning = true;

	try {
		console.info(`Discovering repos from ${RAINBOW_URL}…`);

		// Collect unique DIDs across all collections, retrying on relay failure
		const allDids = new Set<string>();
		let attempt = 0;

		while (attempt < RELAY_MAX_ATTEMPTS) {
			try {
				for (const collection of Object.values(NSID)) {
					if (collection === NSID.PROFILE) continue;
					const dids = await listReposByCollection(collection);
					for (const did of dids) allDids.add(did);
				}
				break; // success
			} catch (err) {
				attempt++;
				if (attempt >= RELAY_MAX_ATTEMPTS) {
					console.error(`Relay discovery failed after ${attempt} attempts, giving up:`, err);
					return;
				}
				const delay = Math.min(
					RELAY_RETRY_BASE_MS * Math.pow(2, attempt - 1) + Math.random() * 1000,
					RELAY_RETRY_MAX_MS
				);
				const message = err instanceof Error ? err.message : String(err);
				console.warn(`Relay discovery attempt ${attempt} failed (retrying in ${(delay / 1000).toFixed(1)}s): ${message}`);
				await new Promise((r) => setTimeout(r, delay));
			}
		}

		console.info(`Found ${allDids.size} repos with Backyard records, starting backfill…`);

		let completed = 0;
		for (const did of allDids) {
			try {
				const count = await backfillUser(did);
				if (count > 0) completed++;
			} catch (err) {
				console.error(`Discovery backfill error for ${did}:`, err);
			}
		}

		console.info(`Discovery backfill complete: ${completed}/${allDids.size} repos indexed`);
	} catch (err) {
		console.error('Discovery backfill failed:', err);
	} finally {
		discoveryRunning = false;
	}
}

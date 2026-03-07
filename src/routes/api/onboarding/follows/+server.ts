import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { getSessionData, setSessionData } from '$lib/server/session.js';
import { resolveDidDocument, getPdsUrl } from '$lib/server/identity.js';
import { createFollow } from '$lib/server/repo.js';
import pool from '$lib/server/db.js';

interface ListRecordsResponse {
	records: {
		uri: string;
		cid: string;
		value: Record<string, unknown>;
	}[];
	cursor?: string;
}

/**
 * Fetch all subject DIDs from the user's Bluesky follow list via
 * com.atproto.repo.listRecords, paginating through all pages.
 */
async function listBlueskyFollows(pdsUrl: string, did: string): Promise<string[]> {
	const subjects = new Set<string>();
	let cursor: string | undefined;

	do {
		const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
		url.searchParams.set('repo', did);
		url.searchParams.set('collection', 'app.bsky.graph.follow');
		url.searchParams.set('limit', '100');
		if (cursor) url.searchParams.set('cursor', cursor);

		const res = await fetch(url.toString());
		if (!res.ok) {
			if (res.status === 400) break;
			throw new Error(`listRecords app.bsky.graph.follow returned ${res.status}`);
		}

		const data = (await res.json()) as ListRecordsResponse;
		for (const rec of data.records) {
			const subject = (rec.value as any)?.subject;
			if (typeof subject === 'string' && subject.startsWith('did:')) {
				subjects.add(subject);
			}
		}
		cursor = data.cursor;
	} while (cursor);

	return [...subjects];
}

const BATCH_SIZE = 10;

/**
 * POST /api/onboarding/follows — import Bluesky follows or skip.
 *
 * Body: { choice: 'import' | 'skip' }
 *
 * For 'import': fetches all app.bsky.graph.follow records from the user's
 * PDS and creates corresponding blue.backyard.graph.follow records.
 * Imports ALL follows, not just users with Backyard accounts.
 */
export const POST: RequestHandler = async ({ locals, cookies, request }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { choice } = body;
	if (!choice || !['import', 'skip'].includes(choice)) {
		return json({ error: 'Invalid choice. Must be "import" or "skip".' }, { status: 400 });
	}

	const did = locals.did;

	try {
		if (choice === 'import') {
			const agent = await getAgent(did);
			if (!agent) {
				return json({ error: 'Failed to restore session. Please sign in again.' }, { status: 401 });
			}

			const didDoc = await resolveDidDocument(did);
			const pdsUrl = getPdsUrl(didDoc);
			if (!pdsUrl) {
				return json({ error: 'Could not resolve PDS URL' }, { status: 500 });
			}

			// Fetch all Bluesky follows
			const blueskyFollows = await listBlueskyFollows(pdsUrl, did);

			// Get existing Backyard follows to avoid duplicates
			const existingResult = await pool.query(
				`SELECT subject_did FROM follows WHERE author_did = $1`,
				[did]
			);
			const existingFollows = new Set(
				existingResult.rows.map((r: { subject_did: string }) => r.subject_did)
			);

			// Filter to new follows only, excluding self
			const toImport = blueskyFollows.filter((f) => f !== did && !existingFollows.has(f));

			// Import in parallel batches using the shared createFollow helper,
			// with silent: true to suppress individual notifications during bulk import.
			let imported = 0;
			for (let i = 0; i < toImport.length; i += BATCH_SIZE) {
				const batch = toImport.slice(i, i + BATCH_SIZE);
				const results = await Promise.allSettled(
					batch.map((subjectDid) => createFollow(agent, did, subjectDid, { silent: true }))
				);
				imported += results.filter((r) => r.status === 'fulfilled').length;
			}

			// Only clear onboarding if at least some follows succeeded
			// (or there was nothing to import). On total failure, let
			// the user retry.
			if (imported > 0 || toImport.length === 0) {
				const session = getSessionData(cookies);
				setSessionData(cookies, { ...session, needsOnboarding: false });
			}

			const failed = toImport.length - imported;
			return json({ success: true, imported, failed, total: blueskyFollows.length });
		}

		// Skip — just clear onboarding
		const session = getSessionData(cookies);
		setSessionData(cookies, { ...session, needsOnboarding: false });

		return json({ success: true });
	} catch (err) {
		console.error('Follow import error:', err);
		return json({ error: 'Failed to import follows.' }, { status: 500 });
	}
};

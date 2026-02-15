import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { createBlock, deleteRecord, parseAtUri } from '$lib/server/repo.js';
import { NSID } from '$lib/lexicon.js';
import { isValidDid, isValidAtUri } from '$lib/server/validation.js';
import pool from '$lib/server/db.js';

export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const agent = await getAgent(locals.did);
	if (!agent) {
		return json({ error: 'Session expired' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}
	const { did, blocking, blockUri } = body;

	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	if (did === locals.did) {
		return json({ error: 'Cannot block yourself' }, { status: 400 });
	}

	try {
		if (blocking && blockUri) {
			// Unblock
			if (typeof blockUri !== 'string' || !isValidAtUri(blockUri)) {
				return json({ error: 'Invalid block URI' }, { status: 400 });
			}
			const parsed = parseAtUri(blockUri);
			if (parsed.repo !== locals.did) {
				return json({ error: 'Cannot modify another user\'s records' }, { status: 403 });
			}
			if (parsed.collection !== NSID.BLOCK) {
				return json({ error: 'Invalid block URI' }, { status: 400 });
			}
			await deleteRecord(agent, blockUri);
			return json({ success: true });
		} else {
			// Block
			const res = await createBlock(agent, locals.did, did);
			return json({ uri: res.uri });
		}
	} catch (err) {
		console.error('Block error:', err);
		return json({ error: 'Failed to update block' }, { status: 500 });
	}
};

/**
 * GET /api/block?did=... — check if the viewer has blocked a specific user
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.did) {
		return json({ blocked: false });
	}

	const targetDid = url.searchParams.get('did');
	if (!targetDid || !isValidDid(targetDid)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	const result = await pool.query(
		'SELECT uri FROM blocks WHERE author_did = $1 AND subject_did = $2 LIMIT 1',
		[locals.did, targetDid]
	);

	return json({
		blocked: result.rows.length > 0,
		blockUri: result.rows[0]?.uri || null
	});
};

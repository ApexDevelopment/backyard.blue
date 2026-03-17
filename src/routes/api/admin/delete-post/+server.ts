import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/signup.js';
import { isValidAtUri } from '$lib/server/validation.js';
import pool from '$lib/server/db.js';

/**
 * GET /api/admin/delete-post?did=... — list pending deletions for a user (admin view).
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const did = url.searchParams.get('did');
	// If no DID, return all pending deletions
	const result = did
		? await pool.query(
				'SELECT id, uri, author_did, reason, queued_by, created_at FROM pending_deletions WHERE author_did = $1 ORDER BY created_at DESC',
				[did]
			)
		: await pool.query(
				'SELECT id, uri, author_did, reason, queued_by, created_at FROM pending_deletions ORDER BY created_at DESC LIMIT 100'
			);

	return json({ items: result.rows });
};

/**
 * POST /api/admin/delete-post — queue a post for user-initiated deletion.
 * The post is hidden from feeds immediately. On next login the author
 * sees a violation modal and must delete the record from their PDS.
 *
 * Body: { uri: string, reason?: string }
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { uri, reason } = body;
	if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
		return json({ error: 'Valid AT URI is required' }, { status: 400 });
	}

	// Extract author DID from the AT URI (at://did:xxx/collection/rkey)
	const authorDid = uri.replace('at://', '').split('/')[0];

	if (isAdmin(authorDid)) {
		return json({ error: "Cannot queue deletion on an admin's post" }, { status: 400 });
	}

	await pool.query(
		`INSERT INTO pending_deletions (uri, author_did, reason, queued_by)
		 VALUES ($1, $2, $3, $4)
		 ON CONFLICT (uri) DO NOTHING`,
		[uri, authorDid, reason || null, locals.did]
	);

	return json({ success: true, uri });
};

/**
 * DELETE /api/admin/delete-post — cancel a pending deletion (admin undo).
 * Body: { uri: string }
 */
export const DELETE: RequestHandler = async ({ locals, request }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { uri } = body;
	if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
		return json({ error: 'Valid AT URI is required' }, { status: 400 });
	}

	await pool.query('DELETE FROM pending_deletions WHERE uri = $1', [uri]);
	return json({ success: true, uri });
};

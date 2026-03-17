import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/signup.js';
import { isValidDid } from '$lib/server/validation.js';
import pool from '$lib/server/db.js';

/**
 * GET /api/admin/ban?did=... — check if a user is banned.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const did = url.searchParams.get('did');
	if (!did || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	const result = await pool.query(
		'SELECT did, reason, banned_by, banned_at FROM appview_bans WHERE did = $1',
		[did]
	);

	if (result.rows.length === 0) {
		return json({ banned: false });
	}

	const row = result.rows[0];
	return json({
		banned: true,
		reason: row.reason,
		bannedBy: row.banned_by,
		bannedAt: row.banned_at
	});
};

/**
 * POST /api/admin/ban — ban a user from the appview.
 * Body: { did: string, reason?: string }
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

	const { did, reason } = body;
	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	if (isAdmin(did)) {
		return json({ error: 'Cannot ban an admin' }, { status: 400 });
	}

	await pool.query(
		`INSERT INTO appview_bans (did, reason, banned_by)
		 VALUES ($1, $2, $3)
		 ON CONFLICT (did) DO UPDATE SET reason = $2, banned_by = $3, banned_at = NOW()`,
		[did, reason || null, locals.did]
	);

	return json({ success: true, did, banned: true });
};

/**
 * DELETE /api/admin/ban — unban a user.
 * Body: { did: string }
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

	const { did } = body;
	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	await pool.query('DELETE FROM appview_bans WHERE did = $1', [did]);
	return json({ success: true, did, banned: false });
};

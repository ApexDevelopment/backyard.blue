import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { isAdmin, getAllowlist, addToAllowlist, removeFromAllowlist } from '$lib/server/signup.js';
import pool from '$lib/server/db.js';

/**
 * GET /api/admin/allowlist — list all allowlisted identifiers.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const entries = await getAllowlist();

	const dids = entries.map((e) => e.identifier);
	const handleMap = new Map<string, string>();
	if (dids.length > 0) {
		const result = await pool.query(
			'SELECT did, handle FROM profiles WHERE did = ANY($1)',
			[dids]
		);
		for (const row of result.rows) {
			if (row.handle) handleMap.set(row.did, row.handle);
		}
	}

	return json({
		entries: entries.map((e) => ({
			...e,
			handle: handleMap.get(e.identifier) ?? null
		}))
	});
};

/**
 * POST /api/admin/allowlist — add a DID to the allowlist.
 * Handles are automatically resolved to DIDs.
 * Body: { identifier: string, note?: string }
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

	const { identifier, note } = body;
	if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
		return json({ error: 'identifier is required' }, { status: 400 });
	}

	try {
		const did = await addToAllowlist(identifier, note);
		return json({ success: true, did });
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Failed to add to allowlist';
		return json({ error: message }, { status: 400 });
	}
};

/**
 * DELETE /api/admin/allowlist — remove an identifier from the allowlist.
 * Body: { identifier: string }
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

	const { identifier } = body;
	if (!identifier || typeof identifier !== 'string' || !identifier.trim()) {
		return json({ error: 'identifier is required' }, { status: 400 });
	}

	const removed = await removeFromAllowlist(identifier);
	if (!removed) {
		return json({ error: 'Identifier not found on allowlist' }, { status: 404 });
	}

	return json({ success: true });
};

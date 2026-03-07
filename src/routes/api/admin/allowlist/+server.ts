import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { isAdmin, getAllowlist, addToAllowlist, removeFromAllowlist } from '$lib/server/signup.js';

/**
 * GET /api/admin/allowlist — list all allowlisted identifiers.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const entries = await getAllowlist();
	return json({ entries });
};

/**
 * POST /api/admin/allowlist — add an identifier (DID or handle) to the allowlist.
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

	await addToAllowlist(identifier, note);
	return json({ success: true });
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

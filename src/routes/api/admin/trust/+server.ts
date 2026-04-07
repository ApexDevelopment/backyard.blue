import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/signup.js';
import { resolveIdentifier } from '$lib/server/identity.js';
import { getTrustStatus, setManualApproval } from '$lib/server/trust.js';

/**
 * GET /api/admin/trust?did=... — get trust evaluation for a user.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const raw = url.searchParams.get('did');
	if (!raw) {
		return json({ error: 'DID or handle is required' }, { status: 400 });
	}

	let did: string;
	try {
		did = await resolveIdentifier(raw);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not resolve identifier';
		return json({ error: message }, { status: 400 });
	}

	const trust = await getTrustStatus(did);
	return json(trust);
};

/**
 * POST /api/admin/trust — manually approve an account.
 * Body: { did: string }
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

	const { did: rawDid } = body;
	if (!rawDid || typeof rawDid !== 'string') {
		return json({ error: 'DID or handle is required' }, { status: 400 });
	}

	let did: string;
	try {
		did = await resolveIdentifier(rawDid);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not resolve identifier';
		return json({ error: message }, { status: 400 });
	}

	await setManualApproval(did, true);
	return json({ success: true, did, approved: true });
};

/**
 * DELETE /api/admin/trust — revoke manual approval for an account.
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

	const { did: rawDid2 } = body;
	if (!rawDid2 || typeof rawDid2 !== 'string') {
		return json({ error: 'DID or handle is required' }, { status: 400 });
	}

	let did: string;
	try {
		did = await resolveIdentifier(rawDid2);
	} catch (err) {
		const message = err instanceof Error ? err.message : 'Could not resolve identifier';
		return json({ error: message }, { status: 400 });
	}

	await setManualApproval(did, false);
	return json({ success: true, did, approved: false });
};

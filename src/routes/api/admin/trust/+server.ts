import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { isAdmin } from '$lib/server/signup.js';
import { isValidDid } from '$lib/server/validation.js';
import { getTrustStatus, setManualApproval } from '$lib/server/trust.js';

/**
 * GET /api/admin/trust?did=... — get trust evaluation for a user.
 */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!isAdmin(locals.did)) {
		return json({ error: 'Forbidden' }, { status: 403 });
	}

	const did = url.searchParams.get('did');
	if (!did || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
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

	const { did } = body;
	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
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

	const { did } = body;
	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	await setManualApproval(did, false);
	return json({ success: true, did, approved: false });
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { createLike, deleteRecord } from '$lib/server/repo.js';
import { isValidAtUri, isValidCid } from '$lib/server/validation.js';

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
	const { uri, cid, liked } = body;

	// Validate: either 'liked' (AT-URI to unlike) or 'uri'+'cid' (to like)
	if (liked) {
		if (typeof liked !== 'string' || !isValidAtUri(liked)) {
			return json({ error: 'Invalid like URI' }, { status: 400 });
		}
	} else {
		if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
			return json({ error: 'Valid subject URI is required' }, { status: 400 });
		}
		if (!cid || typeof cid !== 'string' || !isValidCid(cid)) {
			return json({ error: 'Valid subject CID is required' }, { status: 400 });
		}
	}

	try {
		if (liked) {
			await deleteRecord(agent, liked);
			return json({ success: true });
		} else {
			const res = await createLike(agent, locals.did, uri, cid);
			return json({ uri: res.uri });
		}
	} catch (err) {
		console.error('Like error:', err);
		return json({ error: 'Failed to update like' }, { status: 500 });
	}
};

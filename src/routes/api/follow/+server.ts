import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { createFollow, deleteRecord } from '$lib/server/repo.js';
import { isValidDid, isValidAtUri } from '$lib/server/validation.js';
import { isBlocked } from '$lib/server/feed.js';

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
	const { did, following, followUri } = body;

	if (!did || typeof did !== 'string' || !isValidDid(did)) {
		return json({ error: 'Valid DID is required' }, { status: 400 });
	}

	try {
		if (following && followUri) {
			if (typeof followUri !== 'string' || !isValidAtUri(followUri)) {
				return json({ error: 'Invalid follow URI' }, { status: 400 });
			}
			await deleteRecord(agent, followUri);
			return json({ success: true });
		} else {
			if (await isBlocked(locals.did, did)) {
				return json({ error: 'Cannot follow this user' }, { status: 403 });
			}
			const res = await createFollow(agent, locals.did, did);
			return json({ uri: res.uri });
		}
	} catch (err) {
		console.error('Follow error:', err);
		return json({ error: 'Failed to update follow' }, { status: 500 });
	}
};

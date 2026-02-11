import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { RichText } from '@atproto/api';
import { createComment } from '$lib/server/repo.js';
import { isValidAtUri, isValidCid, MAX_TEXT_LENGTH } from '$lib/server/validation.js';

/**
 * Create a comment on a post (Tumblr-style "note").
 * Uses blue.backyard.feed.comment instead of app.bsky.feed.post with reply field.
 */
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
	const { text, subjectUri, subjectCid, rootUri, rootCid, parentUri, parentCid } = body;

	if (!text || typeof text !== 'string' || text.trim().length === 0) {
		return json({ error: 'Comment text is required' }, { status: 400 });
	}

	if (text.length > MAX_TEXT_LENGTH) {
		return json({ error: `Comment text must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 });
	}

	if (!subjectUri || typeof subjectUri !== 'string' || !isValidAtUri(subjectUri)) {
		return json({ error: 'Valid subject URI is required' }, { status: 400 });
	}

	if (!subjectCid || typeof subjectCid !== 'string' || !isValidCid(subjectCid)) {
		return json({ error: 'Valid subject CID is required' }, { status: 400 });
	}

	try {
		const rt = new RichText({ text: text.trim() });
		await rt.detectFacets(agent);

		const res = await createComment(agent, locals.did, {
			text: rt.text,
			facets: rt.facets,
			subjectUri,
			subjectCid,
			rootUri: rootUri || subjectUri,
			rootCid: rootCid || subjectCid,
			parentUri: parentUri || undefined,
			parentCid: parentCid || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		console.error('Comment creation error:', err);
		return json({ error: 'Failed to create comment' }, { status: 500 });
	}
};

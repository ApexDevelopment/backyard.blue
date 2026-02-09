import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { createReblog, deleteRecord } from '$lib/server/repo.js';
import { isValidAtUri, MAX_TEXT_LENGTH, clampTags, sanitizeFormatFacets } from '$lib/server/validation.js';

/**
 * Reblog a post (Tumblr-style). Supports quick reblogs (no additions)
 * and reblogs with optional text/tags.
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
	const { uri, cid, reblogged, text, tags, formatFacets } = body;

	// Validate: either 'reblogged' (AT-URI to un-reblog) or 'uri'+'cid' (to reblog)
	if (reblogged) {
		if (typeof reblogged !== 'string' || !isValidAtUri(reblogged)) {
			return json({ error: 'Invalid reblog URI' }, { status: 400 });
		}
	} else {
		if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
			return json({ error: 'Valid subject URI is required' }, { status: 400 });
		}
		if (!cid || typeof cid !== 'string') {
			return json({ error: 'Subject CID is required' }, { status: 400 });
		}
		if (text && typeof text !== 'string') {
			return json({ error: 'Reblog text must be a string' }, { status: 400 });
		}
		if (text && text.length > MAX_TEXT_LENGTH) {
			return json({ error: `Reblog text must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 });
		}
	}

	try {
		if (reblogged) {
			await deleteRecord(agent, reblogged);
			return json({ success: true });
		} else {
			const safeTags = clampTags(tags);
			const safeFacets = sanitizeFormatFacets(formatFacets);

			const res = await createReblog(agent, locals.did, {
				subjectUri: uri,
				subjectCid: cid,
				text: text || undefined,
				facets: safeFacets.length > 0 ? safeFacets : undefined,
				tags: safeTags || undefined
			});
			return json({ uri: res.uri });
		}
	} catch (err) {
		console.error('Reblog error:', err);
		return json({ error: 'Failed to update reblog' }, { status: 500 });
	}
};

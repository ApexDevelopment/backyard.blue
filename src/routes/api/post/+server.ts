import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { RichText } from '@atproto/api';
import { createPost, deleteRecord, parseAtUri } from '$lib/server/repo.js';
import { MAX_TEXT_LENGTH, clampTags, sanitizeFormatFacets, isValidAtUri } from '$lib/server/validation.js';
import { NSID } from '$lib/lexicon.js';

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
	const { text, tags, formatFacets, media } = body;

	if (!text || typeof text !== 'string' || text.trim().length === 0) {
		return json({ error: 'Post text is required' }, { status: 400 });
	}

	if (text.length > MAX_TEXT_LENGTH) {
		return json({ error: `Post text must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 });
	}

	if (media && (!Array.isArray(media) || media.length > 4)) {
		return json({ error: 'Media must be an array of up to 4 items' }, { status: 400 });
	}

	try {
		// Use RichText to detect mentions and links
		const rt = new RichText({ text: text.trim() });
		await rt.detectFacets(agent);

		// Merge auto-detected facets with client-supplied formatting facets
		let allFacets = rt.facets ? [...rt.facets] : [];
		const formatFacetsSafe = sanitizeFormatFacets(formatFacets);
		allFacets.push(...formatFacetsSafe);

		const safeTags = clampTags(tags);

		const res = await createPost(agent, locals.did, {
			text: rt.text,
			facets: allFacets.length > 0 ? allFacets : undefined,
			media: Array.isArray(media) && media.length > 0 ? media : undefined,
			tags: safeTags || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		console.error('Post creation error:', err);
		return json({ error: 'Failed to create post' }, { status: 500 });
	}
};

export const DELETE: RequestHandler = async ({ request, locals }) => {
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
	const { uri } = body;

	if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
		return json({ error: 'Valid AT URI is required' }, { status: 400 });
	}

	const { repo, collection } = parseAtUri(uri);

	if (collection !== NSID.POST && collection !== NSID.REBLOG) {
		return json({ error: 'URI must reference a post or reblog' }, { status: 400 });
	}

	if (repo !== locals.did) {
		return json({ error: 'You can only delete your own records' }, { status: 403 });
	}

	try {
		await deleteRecord(agent, uri);
		return json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		return json({ error: 'Failed to delete record' }, { status: 500 });
	}
};

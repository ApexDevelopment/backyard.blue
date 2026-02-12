import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { createReblog, updateReblog, deleteRecord, parseAtUri } from '$lib/server/repo.js';
import { isValidAtUri, isValidCid, MAX_TEXT_LENGTH, clampTags, sanitizeFormatFacets } from '$lib/server/validation.js';
import { NSID } from '$lib/lexicon.js';

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
		if (!cid || typeof cid !== 'string' || !isValidCid(cid)) {
			return json({ error: 'Valid subject CID is required' }, { status: 400 });
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
		const message = err instanceof Error ? err.message : '';
		if (message.includes('depth limit')) {
			return json({ error: 'Reblog chain is too deep' }, { status: 400 });
		}
		console.error('Reblog error:', err);
		return json({ error: 'Failed to update reblog' }, { status: 500 });
	}
};

export const PUT: RequestHandler = async ({ request, locals }) => {
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
	const { uri, text, tags, formatFacets } = body;

	if (!uri || typeof uri !== 'string' || !isValidAtUri(uri)) {
		return json({ error: 'Valid AT URI is required' }, { status: 400 });
	}

	const { repo, collection } = parseAtUri(uri);
	if (repo !== locals.did) {
		return json({ error: 'You can only edit your own records' }, { status: 403 });
	}
	if (collection !== NSID.REBLOG) {
		return json({ error: 'URI must reference a reblog' }, { status: 400 });
	}

	if (text && typeof text !== 'string') {
		return json({ error: 'Reblog text must be a string' }, { status: 400 });
	}
	if (text && text.length > MAX_TEXT_LENGTH) {
		return json({ error: `Reblog text must be ${MAX_TEXT_LENGTH} characters or fewer` }, { status: 400 });
	}

	try {
		const safeTags = clampTags(tags);
		const safeFacets = sanitizeFormatFacets(formatFacets);

		const res = await updateReblog(agent, locals.did, uri, {
			text: text?.trim() || undefined,
			facets: safeFacets.length > 0 ? safeFacets : undefined,
			tags: safeTags || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		console.error('Reblog edit error:', err);
		return json({ error: 'Failed to edit reblog' }, { status: 500 });
	}
};

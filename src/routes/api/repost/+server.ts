import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { RichText } from '@atproto/api';
import { createReblog, updateReblog, deleteRecord, parseAtUri } from '$lib/server/repo.js';
import { isValidAtUri, isValidCid, MAX_TEXT_LENGTH, clampTags, sanitizeFormatFacets } from '$lib/server/validation.js';
import { NSID } from '$lib/lexicon.js';
import { isBlocked } from '$lib/server/feed.js';

const MAX_CONTENT_BLOCKS = 20;

async function processContentBlocks(blocks: any[], agent: any): Promise<any[]> {
	const processed: any[] = [];
	for (const block of blocks) {
		if (block.type === 'text') {
			if (!block.text || typeof block.text !== 'string' || block.text.trim().length === 0) continue;
			if (block.text.length > MAX_TEXT_LENGTH) {
				throw new Error(`Text block must be ${MAX_TEXT_LENGTH} characters or fewer`);
			}
			const rt = new RichText({ text: block.text.trim() });
			await rt.detectFacets(agent);
			let allFacets = rt.facets ? [...rt.facets] : [];
			const formatFacetsSafe = sanitizeFormatFacets(block.formatFacets);
			allFacets.push(...formatFacetsSafe);
			processed.push({
				$type: 'blue.backyard.feed.post#textBlock',
				text: rt.text,
				facets: allFacets.length > 0 ? allFacets : undefined
			});
		} else if (block.type === 'image') {
			if (!block.blob || !block.mimeType) continue;
			processed.push({
				$type: 'blue.backyard.feed.post#imageBlock',
				blob: block.blob,
				mimeType: block.mimeType,
				alt: block.alt || undefined,
				aspectRatio: block.aspectRatio || undefined
			});
		} else if (block.type === 'embed') {
			if (!block.url || typeof block.url !== 'string') continue;
			processed.push({
				$type: 'blue.backyard.feed.post#embedBlock',
				url: block.url
			});
		}
	}
	return processed;
}

/**
 * Reblog a post (Tumblr-style). Supports quick reblogs (no additions)
 * and reblogs with optional content blocks/tags.
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
	const { uri, cid, reblogged, content, tags } = body;

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
		if (content && !Array.isArray(content)) {
			return json({ error: 'Content must be an array' }, { status: 400 });
		}
		if (content && content.length > MAX_CONTENT_BLOCKS) {
			return json({ error: `Reblog may have at most ${MAX_CONTENT_BLOCKS} content blocks` }, { status: 400 });
		}
	}

	try {
		if (reblogged) {
			await deleteRecord(agent, reblogged);
			return json({ success: true });
		} else {
			const targetDid = parseAtUri(uri).repo;
			if (await isBlocked(locals.did, targetDid)) {
				return json({ error: 'Cannot interact with this user' }, { status: 403 });
			}
			const safeTags = clampTags(tags);
			const processedContent = content && content.length > 0
				? await processContentBlocks(content, agent)
				: undefined;

			const res = await createReblog(agent, locals.did, {
				subjectUri: uri,
				subjectCid: cid,
				content: processedContent && processedContent.length > 0 ? processedContent : undefined,
				tags: safeTags || undefined
			});
			return json({ uri: res.uri });
		}
	} catch (err) {
		const message = err instanceof Error ? err.message : '';
		if (message.includes('depth limit')) {
			return json({ error: 'Reblog chain is too deep' }, { status: 400 });
		}
		if (message.includes('characters or fewer')) {
			return json({ error: message }, { status: 400 });
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
	const { uri, content, tags } = body;

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

	if (content && !Array.isArray(content)) {
		return json({ error: 'Content must be an array' }, { status: 400 });
	}
	if (content && content.length > MAX_CONTENT_BLOCKS) {
		return json({ error: `Reblog may have at most ${MAX_CONTENT_BLOCKS} content blocks` }, { status: 400 });
	}

	try {
		const safeTags = clampTags(tags);
		const processedContent = content && content.length > 0
			? await processContentBlocks(content, agent)
			: undefined;

		const res = await updateReblog(agent, locals.did, uri, {
			content: processedContent && processedContent.length > 0 ? processedContent : undefined,
			tags: safeTags || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		if (err instanceof Error && err.message.includes('characters or fewer')) {
			return json({ error: err.message }, { status: 400 });
		}
		console.error('Reblog edit error:', err);
		return json({ error: 'Failed to edit reblog' }, { status: 500 });
	}
};

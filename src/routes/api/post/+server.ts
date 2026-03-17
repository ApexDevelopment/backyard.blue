import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { RichText } from '@atproto/api';
import { createPost, updatePost, deleteRecord, parseAtUri } from '$lib/server/repo.js';
import { MAX_TEXT_LENGTH, clampTags, sanitizeFormatFacets, isValidAtUri } from '$lib/server/validation.js';
import { NSID } from '$lib/lexicon.js';
import pool from '$lib/server/db.js';

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
	const { content, tags } = body;

	if (!content || !Array.isArray(content) || content.length === 0) {
		return json({ error: 'Post content is required' }, { status: 400 });
	}
	if (content.length > MAX_CONTENT_BLOCKS) {
		return json({ error: `Post may have at most ${MAX_CONTENT_BLOCKS} content blocks` }, { status: 400 });
	}

	try {
		const processedContent = await processContentBlocks(content, agent);
		if (processedContent.length === 0) {
			return json({ error: 'Post must have at least one non-empty content block' }, { status: 400 });
		}

		const safeTags = clampTags(tags);

		const res = await createPost(agent, locals.did, {
			content: processedContent,
			tags: safeTags || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		if (err instanceof Error && err.message.includes('characters or fewer')) {
			return json({ error: err.message }, { status: 400 });
		}
		console.error('Post creation error:', err);
		return json({ error: 'Failed to create post' }, { status: 500 });
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
	if (collection !== NSID.POST) {
		return json({ error: 'URI must reference a post' }, { status: 400 });
	}

	if (!content || !Array.isArray(content) || content.length === 0) {
		return json({ error: 'Post content is required' }, { status: 400 });
	}
	if (content.length > MAX_CONTENT_BLOCKS) {
		return json({ error: `Post may have at most ${MAX_CONTENT_BLOCKS} content blocks` }, { status: 400 });
	}

	try {
		const processedContent = await processContentBlocks(content, agent);
		if (processedContent.length === 0) {
			return json({ error: 'Post must have at least one non-empty content block' }, { status: 400 });
		}

		const safeTags = clampTags(tags);

		const res = await updatePost(agent, locals.did, uri, {
			content: processedContent,
			tags: safeTags || undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		if (err instanceof Error && err.message.includes('characters or fewer')) {
			return json({ error: err.message }, { status: 400 });
		}
		console.error('Post edit error:', err);
		return json({ error: 'Failed to edit post' }, { status: 500 });
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
		// Clear any pending deletion entry for this URI
		await pool.query('DELETE FROM pending_deletions WHERE uri = $1', [uri]);
		return json({ success: true });
	} catch (err) {
		console.error('Delete error:', err);
		return json({ error: 'Failed to delete record' }, { status: 500 });
	}
};

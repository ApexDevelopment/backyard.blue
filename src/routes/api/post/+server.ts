import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { RichText } from '@atproto/api';
import { createPost } from '$lib/server/repo.js';

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
	const { text, tags, formatFacets } = body;

	if (!text || typeof text !== 'string' || text.trim().length === 0) {
		return json({ error: 'Post text is required' }, { status: 400 });
	}

	if (text.length > 3000) {
		return json({ error: 'Post text must be 3000 characters or fewer' }, { status: 400 });
	}

	try {
		// Use RichText to detect mentions and links
		const rt = new RichText({ text: text.trim() });
		await rt.detectFacets(agent);

		// Merge auto-detected facets with client-supplied formatting facets
		let allFacets = rt.facets ? [...rt.facets] : [];
		if (Array.isArray(formatFacets)) {
			for (const ff of formatFacets) {
				if (
					ff &&
					ff.index &&
					typeof ff.index.byteStart === 'number' &&
					typeof ff.index.byteEnd === 'number' &&
					Array.isArray(ff.features)
				) {
					// Only allow known formatting feature types from the client
					const safeFeatures = ff.features.filter((f: any) =>
						typeof f?.$type === 'string' && [
							'blue.backyard.richtext.facet#bold',
							'blue.backyard.richtext.facet#italic',
							'blue.backyard.richtext.facet#underline',
							'blue.backyard.richtext.facet#strikethrough'
						].includes(f.$type)
					);
					if (safeFeatures.length > 0) {
						allFacets.push({
							index: { byteStart: ff.index.byteStart, byteEnd: ff.index.byteEnd },
							features: safeFeatures
						});
					}
				}
			}
		}

		const res = await createPost(agent, locals.did, {
			text: rt.text,
			facets: allFacets.length > 0 ? allFacets : undefined,
			tags: tags && Array.isArray(tags) ? tags.slice(0, 30) : undefined
		});

		return json({ uri: res.uri, cid: res.cid });
	} catch (err) {
		console.error('Post creation error:', err);
		return json({ error: 'Failed to create post' }, { status: 500 });
	}
};

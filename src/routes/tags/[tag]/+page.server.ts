import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getPostsByTag } from '$lib/server/feed.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const tag = decodeURIComponent(params.tag);

	if (!tag.trim()) {
		throw error(400, { message: 'Tag is required' });
	}

	const cursor = url.searchParams.get('cursor') || undefined;

	try {
		const result = await getPostsByTag(tag, locals.did || null, 30, cursor);
		return {
			tag,
			feed: result.items,
			cursor: result.cursor
		};
	} catch (err) {
		console.error('Tag feed error:', err);
		throw error(500, { message: 'Failed to load tag feed' });
	}
};

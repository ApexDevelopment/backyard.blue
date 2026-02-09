import type { PageServerLoad } from './$types.js';
import { getTimeline } from '$lib/server/feed.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.did) {
		return { feed: [], cursor: null };
	}

	try {
		const cursor = url.searchParams.get('cursor') || undefined;
		const { items, cursor: nextCursor } = await getTimeline(locals.did, 30, cursor);

		return {
			feed: items,
			cursor: nextCursor
		};
	} catch (err) {
		console.error('Failed to load timeline:', err);
		return { feed: [], cursor: null };
	}
};

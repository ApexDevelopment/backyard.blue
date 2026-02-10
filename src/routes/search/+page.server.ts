import type { PageServerLoad } from './$types.js';
import { searchProfiles } from '$lib/server/identity.js';
import { searchTags } from '$lib/server/feed.js';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q') || '';
	const mode = url.searchParams.get('mode') || 'profiles';

	if (!query.trim()) {
		return { query: '', mode, profileResults: [], tagResults: [] };
	}

	try {
		if (mode === 'tags') {
			const tagResults = await searchTags(query.trim(), 30);
			return { query, mode, profileResults: [], tagResults };
		} else {
			const profileResults = await searchProfiles(query.trim(), 25);
			return { query, mode, profileResults, tagResults: [] };
		}
	} catch (err) {
		console.error('Search error:', err);
		return { query, mode, profileResults: [], tagResults: [] };
	}
};

import type { PageServerLoad } from './$types.js';
import { searchProfiles } from '$lib/server/identity.js';

export const load: PageServerLoad = async ({ url }) => {
	const query = url.searchParams.get('q') || '';

	if (!query.trim()) {
		return { query: '', results: [] };
	}

	try {
		const results = await searchProfiles(query.trim(), 25);
		return { query, results };
	} catch (err) {
		console.error('Search error:', err);
		return { query, results: [] };
	}
};

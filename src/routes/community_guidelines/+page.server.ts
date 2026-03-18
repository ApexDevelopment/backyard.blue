import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getCommunityGuidelinesHtml } from '$lib/server/legal.js';

export const load: PageServerLoad = async () => {
	const html = await getCommunityGuidelinesHtml();
	if (!html) throw error(404, 'community guidelines not configured');
	return { html };
};

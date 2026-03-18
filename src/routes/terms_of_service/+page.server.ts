import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getTosHtml } from '$lib/server/legal.js';

export const load: PageServerLoad = async () => {
	const html = await getTosHtml();
	if (!html) throw error(404, 'terms of service not configured');
	return { html };
};

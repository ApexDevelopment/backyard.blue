import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.did) {
		throw redirect(303, '/');
	}

	return {
		error: url.searchParams.get('error') === 'auth_failed'
			? 'Authentication failed. Please try again.'
			: ''
	};
};

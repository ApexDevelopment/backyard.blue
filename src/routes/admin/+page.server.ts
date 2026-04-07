import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { isAdmin, getSignupMode } from '$lib/server/signup.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}
	if (!isAdmin(locals.did)) {
		throw redirect(303, '/');
	}

	return {
		signupMode: getSignupMode()
	};
};

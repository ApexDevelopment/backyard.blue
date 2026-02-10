import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { getSignupMode } from '$lib/server/signup.js';

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: 'Authentication failed. Please try again.',
	signups_closed: 'Signups are currently disabled on this instance.',
	not_allowed: 'Your account is not on the allowlist for this instance.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.did) {
		throw redirect(303, '/');
	}

	const errorCode = url.searchParams.get('error') || '';

	return {
		error: ERROR_MESSAGES[errorCode] || '',
		signupMode: getSignupMode()
	};
};

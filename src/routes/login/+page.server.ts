import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { getSignupMode } from '$lib/server/signup.js';
import { hasTos, hasCommunityGuidelines } from '$lib/server/legal.js';

const ERROR_MESSAGES: Record<string, string> = {
	auth_failed: 'authentication failed. please try again.',
	not_allowed: 'your account is not on the allowlist for this instance.'
};

export const load: PageServerLoad = async ({ locals, url }) => {
	if (locals.did) {
		throw redirect(303, '/');
	}

	const errorCode = url.searchParams.get('error') || '';

	return {
		error: ERROR_MESSAGES[errorCode] || '',
		signupMode: getSignupMode(),
		hasTos: hasTos(),
		hasCommunityGuidelines: hasCommunityGuidelines()
	};
};

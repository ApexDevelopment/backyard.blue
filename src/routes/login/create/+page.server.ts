import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { getSignupMode } from '$lib/server/signup.js';
import { hasTos, hasCommunityGuidelines } from '$lib/server/legal.js';
import { env } from '$env/dynamic/private';

export const load: PageServerLoad = async ({ locals }) => {
	if (locals.did) {
		throw redirect(303, '/');
	}

	const captchaPdsAllowlist = (env.CAPTCHA_PDS_ALLOWLIST || '')
		.split(',')
		.map(s => s.trim().toLowerCase())
		.filter(Boolean);

	return {
		signupMode: getSignupMode(),
		hasTos: hasTos(),
		hasCommunityGuidelines: hasCommunityGuidelines(),
		captchaPdsAllowlist
	};
};

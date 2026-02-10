import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { getBlueskyProfileRecord } from '$lib/server/identity.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}

	if (!locals.needsOnboarding) {
		throw redirect(303, '/');
	}

	// Fetch their Bluesky profile for preview
	let blueskyProfile: {
		displayName?: string;
		description?: string;
		avatarUrl?: string;
		bannerUrl?: string;
	} | null = null;

	try {
		blueskyProfile = await getBlueskyProfileRecord(locals.did);
	} catch {
		// Not critical if this fails
	}

	// If no Bluesky profile exists, there's nothing to import — go straight
	// to the mandatory profile creation flow.
	if (!blueskyProfile) {
		throw redirect(303, '/onboarding/create');
	}

	return {
		blueskyProfile
	};
};

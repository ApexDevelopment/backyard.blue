import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { resolveDidDocument, getHandle } from '$lib/server/identity.js';

/**
 * Mandatory profile creation during onboarding.
 * Requires authentication and the needsOnboarding flag.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}

	if (!locals.needsOnboarding) {
		throw redirect(303, '/');
	}

	// Resolve the user's handle for the editor component
	let handle = locals.did;
	try {
		const didDoc = await resolveDidDocument(locals.did);
		handle = getHandle(didDoc) || locals.did;
	} catch {
		// Fall back to DID if resolution fails
	}

	return { handle };
};

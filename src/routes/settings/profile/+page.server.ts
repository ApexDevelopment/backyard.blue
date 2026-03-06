import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { ensureProfile, resolveDidDocument, getHandle, getBackyardProfileRecord } from '$lib/server/identity.js';

/**
 * Profile edit page. Loads the user's current profile data for pre-population.
 */
export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}

	const profile = await ensureProfile(locals.did);
	if (!profile) {
		throw redirect(303, '/');
	}

	// Also try to load the raw backyard record to check for existing blob
	// data that the cached profile might not express (e.g. pronouns).
	let rawRecord: Record<string, unknown> | null = null;
	try {
		rawRecord = await getBackyardProfileRecord(locals.did);
	} catch {
		// Non-fatal — we'll fall back to cached data
	}

	return {
		handle: profile.handle,
		hasBackyardProfile: rawRecord !== null,
		initialData: {
			displayName: (rawRecord?.displayName as string) || profile.displayName || '',
			pronouns: (rawRecord?.pronouns as string) || profile.pronouns || '',
			description: (rawRecord?.description as string) || profile.description || '',
			avatar: profile.avatar || undefined,
			banner: profile.banner || undefined
		}
	};
};

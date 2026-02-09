import type { LayoutServerLoad } from './$types.js';
import { ensureProfile } from '$lib/server/identity.js';
import type { BackyardProfile } from '$lib/types.js';

export const load: LayoutServerLoad = async ({ locals, cookies }) => {
	const theme = cookies.get('backyard_theme') || 'light';

	let user: BackyardProfile | null = null;

	if (locals.did) {
		try {
			user = await ensureProfile(locals.did);
		} catch (err) {
			console.error('Failed to load user profile:', err);
		}
	}

	return { user, theme };
};

import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getProfileByHandle, ensureProfile } from '$lib/server/identity.js';
import { getFollowing } from '$lib/server/feed.js';

export const load: PageServerLoad = async ({ params, url }) => {
	const handle = params.handle;

	try {
		let profile = await getProfileByHandle(handle);
		if (!profile && handle.startsWith('did:')) {
			profile = await ensureProfile(handle);
		}
		if (!profile) {
			throw error(404, { message: `User @${handle} not found` });
		}

		const cursor = url.searchParams.get('cursor') || undefined;
		const result = await getFollowing(profile.did, 50, cursor);

		return {
			handle: profile.handle,
			displayName: profile.displayName,
			follows: result.follows.map((f) => ({
				did: f.did,
				handle: f.handle,
				displayName: f.displayName,
				avatar: f.avatar
			})),
			cursor: result.cursor
		};
	} catch (err: any) {
		console.error('Following list error:', err);
		if (err?.status === 404) throw err;
		throw error(500, { message: 'Failed to load following list' });
	}
};

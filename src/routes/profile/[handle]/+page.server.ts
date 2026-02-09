import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getProfileByHandle, ensureProfile } from '$lib/server/identity.js';
import { getAuthorFeed, isFollowing, getProfileStats } from '$lib/server/feed.js';
import { backfillIfNeeded } from '$lib/server/backfill.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const handle = params.handle;

	try {
		let profile = await getProfileByHandle(handle);

		if (!profile && handle.startsWith('did:')) {
			profile = await ensureProfile(handle);
		}

		if (!profile) {
			throw error(404, { message: `User @${handle} not found` });
		}

		// Trigger background backfill if we have no posts for this user
		backfillIfNeeded(profile.did).catch(() => {});

		const isOwnProfile = locals.did === profile.did;

		let followingStatus = false;
		let followUri = '';
		if (locals.did && !isOwnProfile) {
			const uri = await isFollowing(locals.did, profile.did);
			if (uri) {
				followingStatus = true;
				followUri = uri;
			}
		}

		const stats = await getProfileStats(profile.did);

		const cursor = url.searchParams.get('cursor') || undefined;
		const feedResult = await getAuthorFeed(profile.did, locals.did || null, 30, cursor);

		return {
			profile,
			isOwnProfile,
			isFollowing: followingStatus,
			followUri,
			postsCount: stats.postsCount,
			followsCount: stats.followingCount,
			feed: feedResult.items,
			cursor: feedResult.cursor
		};
	} catch (err: any) {
		console.error('Profile load error:', err);
		if (err?.status === 404) throw err;
		throw error(500, { message: 'Failed to load profile' });
	}
};

import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getProfileByHandle, ensureProfile, resolveHandleToDid } from '$lib/server/identity.js';
import { getAuthorFeed, isFollowing, getProfileStats, isBlocked } from '$lib/server/feed.js';
import { backfillIfNeeded } from '$lib/server/backfill.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const handle = params.handle;

	try {
		let profile = await getProfileByHandle(handle);

		// If not in cache and it looks like a DID, resolve directly
		if (!profile && handle.startsWith('did:')) {
			profile = await ensureProfile(handle);
		}

		// If still not found, try resolving the handle to a DID and ensure
		// the profile from the network — this covers deleted/evicted cache rows.
		if (!profile) {
			const did = await resolveHandleToDid(handle);
			if (did) {
				profile = await ensureProfile(did);
			}
		}

		if (!profile) {
			throw error(404, { message: `User @${handle} not found` });
		}

		// Trigger background backfill if we have no posts for this user
		// Fire-and-forget is fine here. Backfill will eventually
		// guarantee consistency.
		backfillIfNeeded(profile.did).catch(() => {});

		const isOwnProfile = locals.did === profile.did;

		// Check if the profile owner has blocked the viewer
		let blockedByProfile = false;
		if (locals.did && !isOwnProfile) {
			blockedByProfile = await isBlocked(locals.did, profile.did);
		}

		let followingStatus = false;
		let followUri = '';
		if (locals.did && !isOwnProfile && !blockedByProfile) {
			const uri = await isFollowing(locals.did, profile.did);
			if (uri) {
				followingStatus = true;
				followUri = uri;
			}
		}

		const stats = await getProfileStats(profile.did);

		const cursor = url.searchParams.get('cursor') || undefined;
		const feedResult = blockedByProfile
			? { items: [], cursor: null }
			: await getAuthorFeed(profile.did, locals.did || null, 30, cursor);

		return {
			profile,
			isOwnProfile,
			isFollowing: followingStatus,
			followUri,
			blockedByProfile,
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

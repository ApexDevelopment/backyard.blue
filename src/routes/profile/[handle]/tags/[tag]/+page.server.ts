import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getProfileByHandle, ensureProfile } from '$lib/server/identity.js';
import { getPostsByTagAndAuthor } from '$lib/server/feed.js';
import { backfillIfNeeded } from '$lib/server/backfill.js';

export const load: PageServerLoad = async ({ params, locals, url }) => {
	const handle = params.handle;
	const tag = decodeURIComponent(params.tag);

	if (!tag.trim()) {
		throw error(400, { message: 'Tag is required' });
	}

	try {
		let profile = await getProfileByHandle(handle);

		if (!profile && handle.startsWith('did:')) {
			profile = await ensureProfile(handle);
		}

		if (!profile) {
			throw error(404, { message: `User @${handle} not found` });
		}

		// Trigger background backfill if needed
		backfillIfNeeded(profile.did).catch(() => {});

		const cursor = url.searchParams.get('cursor') || undefined;
		const result = await getPostsByTagAndAuthor(tag, profile.did, locals.did || null, 30, cursor);

		return {
			profile,
			tag,
			feed: result.items,
			cursor: result.cursor
		};
	} catch (err: any) {
		console.error('Profile tag feed error:', err);
		if (err?.status === 404) throw err;
		throw error(500, { message: 'Failed to load tag feed' });
	}
};

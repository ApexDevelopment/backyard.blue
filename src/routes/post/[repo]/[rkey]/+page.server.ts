import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getPost, getComments } from '$lib/server/feed.js';
import { getProfileByHandle, resolveHandleToDid, ensureProfile } from '$lib/server/identity.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { repo, rkey } = params;

	// Resolve repo to a DID — it may already be a DID, or it may be a handle
	let did: string;
	if (repo.startsWith('did:')) {
		did = repo;
	} else {
		// Treat as a handle — look up in local DB first
		const cached = await getProfileByHandle(repo);
		if (cached) {
			did = cached.did;
		} else {
			// Resolve handle to DID via AT Protocol
			const resolved = await resolveHandleToDid(repo);
			if (!resolved) {
				throw error(404, { message: 'User not found' });
			}
			did = resolved;
			// Ensure the profile is cached for future lookups
			ensureProfile(did).catch(() => {});
		}
	}

	const uri = `at://${did}/blue.backyard.feed.post/${rkey}`;

	try {
		const post = await getPost(uri, locals.did || null);

		if (!post) {
			throw error(404, { message: 'Post not found' });
		}

		const comments = await getComments(uri, 50);

		return {
			post,
			comments
		};
	} catch (err: any) {
		console.error('Post thread error:', err);
		if (err?.status === 404) throw err;
		throw error(500, { message: 'Failed to load post' });
	}
};

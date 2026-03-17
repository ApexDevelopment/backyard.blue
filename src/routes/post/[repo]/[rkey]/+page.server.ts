import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getPost, getComments, getPostReblogs, getReblog, buildReblogChains } from '$lib/server/feed.js';
import type { BackyardChainEntry, BackyardReblogInfo } from '$lib/types.js';
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
		let post = await getPost(uri, locals.did || null);
		let chain: BackyardChainEntry[] | undefined;
		let reblog: BackyardReblogInfo | undefined;

		// Fallback: Check if it is a reblog URI
		if (!post) {
			const reblogUri = `at://${did}/blue.backyard.feed.reblog/${rkey}`;
			const reblogInfo = await getReblog(reblogUri);
			if (reblogInfo) {
				post = await getPost(reblogInfo.root_post_uri, locals.did || null);
				if (post) {
					// It's a reblog, build the chain to show it properly
					const chains = await buildReblogChains([reblogUri]);
					chain = chains.get(reblogUri);
					
					// If we have a chain, we can extract reblog info from the leaf
					if (chain && chain.length > 0) {
						const leaf = chain[chain.length - 1];
						reblog = {
							uri: leaf.uri,
							cid: leaf.cid,
							by: leaf.author,
							content: leaf.content,
							tags: leaf.tags,
							createdAt: leaf.createdAt
						};
					}
				}
			}
		}

		if (!post) {
			throw error(404, { message: 'Post not found' });
		}

		const comments = await getComments(post.uri, 50);
		const reblogs = await getPostReblogs(post.uri, 10);

		return {
			post,
			comments,
			reblogs,
			chain,
			reblog
		};
	} catch (err: any) {
		console.error('Post thread error:', err);
		if (err?.status === 404) throw err;
		throw error(500, { message: 'Failed to load post' });
	}
};

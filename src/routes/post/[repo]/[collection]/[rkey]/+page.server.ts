import type { PageServerLoad } from './$types.js';
import { error } from '@sveltejs/kit';
import { getPost, getComments } from '$lib/server/feed.js';

export const load: PageServerLoad = async ({ params, locals }) => {
	const { repo, collection, rkey } = params;
	const uri = `at://${repo}/${collection}/${rkey}`;

	try {
		const post = await getPost(uri, locals.did || null);

		if (!post) {
			throw error(404, { message: 'Post not found' });
		}

		// Load comments on this post
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

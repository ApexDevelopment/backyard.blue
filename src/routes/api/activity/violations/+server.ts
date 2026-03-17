import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import pool from '$lib/server/db.js';
import { getPost } from '$lib/server/feed.js';

/**
 * GET /api/activity/violations — list the current user's pending deletions
 * with full post data so the violation modal can render each post.
 */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const result = await pool.query(
		'SELECT id, uri, reason, created_at FROM pending_deletions WHERE author_did = $1 ORDER BY created_at DESC',
		[locals.did]
	);

	const items = await Promise.all(
		result.rows.map(async (row: any) => {
			const post = await getPost(row.uri, locals.did!);
			return {
				id: row.id,
				uri: row.uri,
				reason: row.reason,
				created_at: row.created_at,
				post: post ?? undefined
			};
		})
	);

	return json({ items });
};

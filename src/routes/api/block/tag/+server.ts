import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import pool from '$lib/server/db.js';

/**
 * POST /api/block/tag — block or unblock a tag for the logged-in user.
 *
 * Body: { tag: string, blocked?: boolean }
 *   - If blocked is falsy, blocks the tag.
 *   - If blocked is truthy, unblocks the tag.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { tag, blocked } = body;

	if (!tag || typeof tag !== 'string' || tag.trim().length === 0) {
		return json({ error: 'Tag is required' }, { status: 400 });
	}

	const normalizedTag = tag.trim().toLowerCase();

	try {
		if (blocked) {
			// Unblock
			await pool.query(
				'DELETE FROM blocked_tags WHERE author_did = $1 AND tag = $2',
				[locals.did, normalizedTag]
			);
		} else {
			// Block
			await pool.query(
				`INSERT INTO blocked_tags (author_did, tag)
				 VALUES ($1, $2)
				 ON CONFLICT (author_did, tag) DO NOTHING`,
				[locals.did, normalizedTag]
			);
		}
		return json({ success: true });
	} catch (err) {
		console.error('Tag block error:', err);
		return json({ error: 'Failed to update tag block' }, { status: 500 });
	}
};

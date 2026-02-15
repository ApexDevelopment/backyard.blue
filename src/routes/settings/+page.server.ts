import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import pool from '$lib/server/db.js';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}

	const result = await pool.query(
		'SELECT tag FROM blocked_tags WHERE author_did = $1 ORDER BY created_at DESC',
		[locals.did]
	);

	return {
		blockedTags: result.rows.map((r: any) => r.tag as string)
	};
};

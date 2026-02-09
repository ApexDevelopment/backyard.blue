import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { clearSession } from '$lib/server/session.js';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	return redirect(303, '/');
};

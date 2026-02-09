import { redirect, type RequestHandler } from '@sveltejs/kit';
import { clearSession } from '$lib/server/session.js';

export const POST: RequestHandler = async ({ cookies }) => {
	clearSession(cookies);
	return redirect(303, '/');
};

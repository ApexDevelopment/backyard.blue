import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOAuthClient } from '$lib/server/oauth.js';
import { setSessionData } from '$lib/server/session.js';

/**
 * OAuth callback handler.
 * Completes the authorization flow and stores the session.
 */
export const GET: RequestHandler = async (event) => {
	const params = new URLSearchParams(event.url.search);

	try {
		const client = await getOAuthClient();
		const { session: oauthSession } = await client.callback(params);

		// Store the user's DID in the encrypted cookie session
		setSessionData(event.cookies, { did: oauthSession.did });
	} catch (err) {
		console.error('OAuth callback error:', err);
		throw redirect(303, '/login?error=auth_failed');
	}

	throw redirect(303, '/');
};

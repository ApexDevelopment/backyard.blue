import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOAuthClient } from '$lib/server/oauth.js';

/**
 * Serves the JWKS (JSON Web Key Set) for OAuth client authentication.
 */
export const GET: RequestHandler = async () => {
	const client = await getOAuthClient();
	return json(client.jwks, {
		headers: {
			'Cache-Control': 'public, max-age=3600'
		}
	});
};

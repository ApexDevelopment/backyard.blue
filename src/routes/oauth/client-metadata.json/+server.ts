import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOAuthClient } from '$lib/server/oauth.js';

/**
 * Serves the OAuth client metadata JSON document.
 * This endpoint must be accessible at the URL matching the client_id.
 */
export const GET: RequestHandler = async () => {
	const client = await getOAuthClient();
	return json(client.clientMetadata, {
		headers: {
			'Cache-Control': 'public, max-age=3600'
		}
	});
};

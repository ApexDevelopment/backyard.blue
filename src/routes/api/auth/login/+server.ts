import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOAuthClient } from '$lib/server/oauth.js';
import { OAUTH_SCOPE } from '$lib/lexicon.js';

/**
 * Initiates the OAuth authorization flow.
 * Accepts a handle and returns the authorization URL.
 */
export const POST: RequestHandler = async ({ request }) => {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid json body' }, { status: 400 });
	}
	const { handle } = body;

	if (!handle || typeof handle !== 'string') {
		return json({ error: 'handle is required' }, { status: 400 });
	}

	try {
		const client = await getOAuthClient();
		const url = await client.authorize(handle, {
			scope: OAUTH_SCOPE
		});

		return json({ url: url.toString() });
	} catch (err) {
		console.error('OAuth authorize error:', err);
		return json({ error: 'failed to initiate login. please check your handle.' }, { status: 500 });
	}
};

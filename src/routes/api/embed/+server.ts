import { json, type RequestHandler } from '@sveltejs/kit';
import { fetchOGData } from '$lib/server/opengraph.js';

/**
 * GET /api/embed?url=<encoded-url>
 *
 * Proxies OpenGraph / Twitter Card metadata for the given URL.
 * Returns { title, description, image, siteName, url } or 404 if no metadata found.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const target = url.searchParams.get('url');
	if (!target) {
		return json({ error: 'missing url parameter' }, { status: 400 });
	}

	// Block obviously non-http URLs
	if (!/^https?:\/\//i.test(target)) {
		return json({ error: 'invalid url' }, { status: 400 });
	}

	const data = await fetchOGData(target);
	if (!data) {
		return json({ error: 'no metadata found' }, { status: 404 });
	}

	return json(data, {
		headers: {
			'Cache-Control': 'public, max-age=86400' // 1 day browser cache
		}
	});
};

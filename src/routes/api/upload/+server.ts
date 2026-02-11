import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getAgent } from '$lib/server/oauth.js';

const MAX_FILE_SIZE = 1_000_000; // 1 MB
const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);

/**
 * POST /api/upload — upload a single image blob to the user's PDS.
 *
 * Accepts a raw binary body with the image's Content-Type header.
 * Returns `{ blob, mimeType }` (the blob ref from com.atproto.repo.uploadBlob)
 * that can be embedded directly into a post record's `media` array.
 */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	const agent = await getAgent(locals.did);
	if (!agent) {
		return json({ error: 'Session expired' }, { status: 401 });
	}

	const mimeType = request.headers.get('content-type')?.split(';')[0] ?? '';
	if (!ALLOWED_TYPES.has(mimeType)) {
		return json({ error: `Unsupported file type: ${mimeType}. Use PNG, JPEG, GIF, or WebP.` }, { status: 400 });
	}

	let bytes: Uint8Array;
	try {
		bytes = new Uint8Array(await request.arrayBuffer());
	} catch {
		return json({ error: 'Could not read request body' }, { status: 400 });
	}

	if (bytes.length === 0) {
		return json({ error: 'Empty file' }, { status: 400 });
	}

	if (bytes.length > MAX_FILE_SIZE) {
		return json({ error: 'File exceeds the 1 MB size limit.' }, { status: 400 });
	}

	try {
		const uploadRes = await agent.com.atproto.repo.uploadBlob(bytes, {
			encoding: mimeType
		});
		return json({ blob: uploadRes.data.blob, mimeType });
	} catch (err) {
		console.error('Blob upload error:', err);
		return json({ error: 'Failed to upload image to PDS' }, { status: 500 });
	}
};

import { json } from '@sveltejs/kit';
import type { RequestHandler } from '@sveltejs/kit';
import { getAgent } from '$lib/server/oauth.js';

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);

const MAX_IMAGE_SIZE = 10_000_000; // 10 MB (GIFs can be several MB)
const MAX_VIDEO_SIZE = 50_000_000; // 50 MB (matches lexicon maxSize)

function maxSizeForType(mimeType: string): number {
	return VIDEO_TYPES.has(mimeType) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
}

function formatSize(bytes: number): string {
	return bytes >= 1_000_000 ? `${bytes / 1_000_000} MB` : `${bytes / 1_000} KB`;
}

/**
 * POST /api/upload — upload a media blob (image or video) to the user's PDS.
 *
 * Accepts a raw binary body with the file's Content-Type header.
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
		return json(
			{ error: `Unsupported file type: ${mimeType}. Use PNG, JPEG, GIF, WebP, AVIF, MP4, or WebM.` },
			{ status: 400 }
		);
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

	const limit = maxSizeForType(mimeType);
	if (bytes.length > limit) {
		return json({ error: `File exceeds the ${formatSize(limit)} size limit.` }, { status: 400 });
	}

	try {
		const uploadRes = await agent.com.atproto.repo.uploadBlob(bytes, {
			encoding: mimeType
		});
		return json({ blob: uploadRes.data.blob, mimeType });
	} catch (err) {
		console.error('Blob upload error:', err);
		return json({ error: 'Failed to upload file to PDS' }, { status: 500 });
	}
};

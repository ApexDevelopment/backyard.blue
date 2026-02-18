import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { NSID } from '$lib/lexicon.js';
import {
	getBackyardProfileRecord,
	updateCachedProfile,
	blobUrl
} from '$lib/server/identity.js';


const MAX_NAME_LEN = 640;
const MAX_PRONOUNS_LEN = 640;
const MAX_BIO_LEN = 2560;
const MAX_BLOB_SIZE = 1_000_000;
const ALLOWED_IMAGE_TYPES = ['image/png', 'image/jpeg'];

/**
 * Parse a data-URL (e.g. "data:image/png;base64,iVBOR...") into its MIME type
 * and raw bytes.
 */
function parseDataUrl(dataUrl: string): { mimeType: string; bytes: Uint8Array } | null {
	const match = dataUrl.match(/^data:([^;]+);base64,(.+)$/);
	if (!match) return null;
	const mimeType = match[1];
	const bytes = Uint8Array.from(atob(match[2]), (c) => c.charCodeAt(0));
	return { mimeType, bytes };
}

/**
 * POST /api/profile — create or update the user's blue.backyard.actor.profile.
 *
 * Accepts JSON with:
 *   displayName, pronouns, description  — string fields
 *   avatar, banner                       — base64 data-URL strings (or null)
 *   avatarAction, bannerAction           — 'keep' | 'upload' | 'remove'
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.did) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	const did = locals.did;
	const agent = await getAgent(did);
	if (!agent) {
		return json({ error: 'Failed to restore session. Please sign in again.' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const displayName = (body.displayName as string || '').trim();
	const pronouns = (body.pronouns as string || '').trim();
	const description = (body.description as string || '').trim();
	const avatarAction: string = body.avatarAction || 'keep';
	const bannerAction: string = body.bannerAction || 'keep';
	const avatarDataUrl: string | null = body.avatar || null;
	const bannerDataUrl: string | null = body.banner || null;

	// ── Validation ──────────────────────────────────────────────────────
	if (displayName.length > MAX_NAME_LEN) {
		return json({ error: 'Display name is too long.' }, { status: 400 });
	}
	if (pronouns.length > MAX_PRONOUNS_LEN) {
		return json({ error: 'Pronouns field is too long.' }, { status: 400 });
	}
	if (description.length > MAX_BIO_LEN) {
		return json({ error: 'Bio is too long (max 2 560 characters).' }, { status: 400 });
	}

	// Parse and validate image data-URLs
	const parsedAvatar = avatarDataUrl ? parseDataUrl(avatarDataUrl) : null;
	const parsedBanner = bannerDataUrl ? parseDataUrl(bannerDataUrl) : null;

	for (const [label, parsed] of [
		['Avatar', parsedAvatar],
		['Banner', parsedBanner]
	] as const) {
		if (parsed) {
			if (!ALLOWED_IMAGE_TYPES.includes(parsed.mimeType)) {
				return json({ error: `${label} must be a PNG or JPEG image.` }, { status: 400 });
			}
			if (parsed.bytes.length > MAX_BLOB_SIZE) {
				return json({ error: `${label} must be under 1 MB.` }, { status: 400 });
			}
		}
	}

	try {
		// Fetch the existing record so we can preserve blob refs when the
		// user hasn't changed an image ("keep") and preserve the original
		// createdAt timestamp.
		let existing: Record<string, unknown> | null = null;
		if (avatarAction === 'keep' || bannerAction === 'keep') {
			existing = await getBackyardProfileRecord(did);
		}

		const record: Record<string, unknown> = {
			$type: NSID.PROFILE,
			createdAt: (existing as any)?.createdAt || new Date().toISOString()
		};

		if (displayName) record.displayName = displayName;
		if (pronouns) record.pronouns = pronouns;
		if (description) record.description = description;

		// ── Avatar ──────────────────────────────────────────────────────
		if (avatarAction === 'upload' && parsedAvatar) {
			const uploadRes = await agent.com.atproto.repo.uploadBlob(parsedAvatar.bytes, {
				encoding: parsedAvatar.mimeType
			});
			record.avatar = uploadRes.data.blob;
		} else if (avatarAction === 'keep' && existing?.avatar) {
			record.avatar = existing.avatar;
		}
		// 'remove' → omit avatar from the record

		// ── Banner ──────────────────────────────────────────────────────
		if (bannerAction === 'upload' && parsedBanner) {
			const uploadRes = await agent.com.atproto.repo.uploadBlob(parsedBanner.bytes, {
				encoding: parsedBanner.mimeType
			});
			record.banner = uploadRes.data.blob;
		} else if (bannerAction === 'keep' && existing?.banner) {
			record.banner = existing.banner;
		}

		// ── Write to PDS ────────────────────────────────────────────────
		await agent.com.atproto.repo.putRecord({
			repo: did,
			collection: NSID.PROFILE,
			rkey: 'self',
			record
		});

		// ── Update local profile cache ──────────────────────────────────
		const cacheUpdates: Record<string, string | null | undefined> = {
			displayName: displayName || null,
			pronouns: pronouns || null,
			description: description || null
		};

		const avatarBlob = record.avatar as any;
		if (avatarBlob?.ref?.$link) {
			cacheUpdates.avatar = blobUrl(did, avatarBlob.ref.$link);
		} else if (avatarAction !== 'keep') {
			cacheUpdates.avatar = null;
		}

		const bannerBlob = record.banner as any;
		if (bannerBlob?.ref?.$link) {
			cacheUpdates.banner = blobUrl(did, bannerBlob.ref.$link);
		} else if (bannerAction !== 'keep') {
			cacheUpdates.banner = null;
		}

		await updateCachedProfile(did, cacheUpdates as any);

		return json({ success: true });
	} catch (err) {
		console.error('Profile update error:', err);
		return json({ error: 'Failed to save profile. Please try again.' }, { status: 500 });
	}
};

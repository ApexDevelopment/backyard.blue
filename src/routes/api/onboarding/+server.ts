import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getAgent } from '$lib/server/oauth.js';
import { NSID } from '$lib/lexicon.js';
import { resolveDidDocument, getPdsUrl, blobUrl, updateCachedProfile } from '$lib/server/identity.js';

/**
 * POST /api/onboarding — complete profile onboarding.
 *
 * Body: { choice: 'import' | 'fresh' | 'skip' }
 *
 * - 'import': Copy the user's Bluesky profile to blue.backyard.actor.profile
 * - 'fresh': Create a blank blue.backyard.actor.profile record
 * - 'skip': Don't create a Backyard profile; continue using Bluesky data
 */
export const POST: RequestHandler = async ({ locals, request }) => {
	if (!locals.did) {
		return json({ error: 'Not authenticated' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'Invalid JSON body' }, { status: 400 });
	}

	const { choice } = body;
	if (!choice || !['import', 'fresh', 'skip'].includes(choice)) {
		return json({ error: 'Invalid choice. Must be "import", "fresh", or "skip".' }, { status: 400 });
	}

	const did = locals.did;

	try {
		if (choice === 'skip') {
			// No profile to set up — proceed to follow import step
			return json({ success: true });
		}

		const agent = await getAgent(did);
		if (!agent) {
			return json({ error: 'Failed to restore session. Please sign in again.' }, { status: 401 });
		}

		const now = new Date().toISOString();

		if (choice === 'fresh') {
			// Create a minimal Backyard profile
			await agent.com.atproto.repo.putRecord({
				repo: did,
				collection: NSID.PROFILE,
				rkey: 'self',
				record: {
					$type: NSID.PROFILE,
					createdAt: now
				}
			});

			// Clear cached profile so it refreshes
			await updateCachedProfile(did, {
				displayName: undefined,
				description: undefined,
				pronouns: undefined,
				avatar: undefined,
				banner: undefined
			});
		} else if (choice === 'import') {
			// Fetch Bluesky profile from PDS
			const didDoc = await resolveDidDocument(did);
			const pdsUrl = getPdsUrl(didDoc);

			if (!pdsUrl) {
				return json({ error: 'Could not resolve PDS URL' }, { status: 500 });
			}

			// Get Bluesky profile record
			let bskyRecord: any = null;
			try {
				const bskyRes = await fetch(
					`${pdsUrl}/xrpc/com.atproto.repo.getRecord?` +
						`repo=${encodeURIComponent(did)}&` +
						`collection=app.bsky.actor.profile&rkey=self`
				);
				if (bskyRes.ok) {
					const data = await bskyRes.json();
					bskyRecord = data.value;
				}
			} catch {
				// No Bluesky profile found
			}

			if (!bskyRecord) {
				// If no Bluesky profile, fall back to creating a fresh one
				await agent.com.atproto.repo.putRecord({
					repo: did,
					collection: NSID.PROFILE,
					rkey: 'self',
					record: {
						$type: NSID.PROFILE,
						createdAt: now
					}
				});
			} else {
				// Build the Backyard profile record, copying blobs by reference.
				// Blobs are stored in the PDS — we can reference the same blob refs
				// since they're in the same repo.
				const backyardRecord: Record<string, unknown> = {
					$type: NSID.PROFILE,
					createdAt: now
				};

				if (bskyRecord.displayName) {
					backyardRecord.displayName = bskyRecord.displayName;
				}
				if (bskyRecord.pronouns) {
					backyardRecord.pronouns = bskyRecord.pronouns;
				}
				if (bskyRecord.description) {
					// Backyard bio is capped at 256 graphemes; trim if needed
					backyardRecord.description = bskyRecord.description.slice(0, 2560);
				}
				// Copy blob references directly — same PDS, same repo
				if (bskyRecord.avatar) {
					backyardRecord.avatar = bskyRecord.avatar;
				}
				if (bskyRecord.banner) {
					backyardRecord.banner = bskyRecord.banner;
				}

				await agent.com.atproto.repo.putRecord({
					repo: did,
					collection: NSID.PROFILE,
					rkey: 'self',
					record: backyardRecord
				});

				// Update local profile cache
				const updates: any = {};
				if (bskyRecord.displayName) updates.displayName = bskyRecord.displayName;
				if (bskyRecord.pronouns) updates.pronouns = bskyRecord.pronouns;
				if (bskyRecord.description) updates.description = bskyRecord.description.slice(0, 2560);
				if (bskyRecord.avatar?.ref?.$link) {
					updates.avatar = blobUrl(did, bskyRecord.avatar.ref.$link);
				}
				if (bskyRecord.banner?.ref?.$link) {
					updates.banner = blobUrl(did, bskyRecord.banner.ref.$link);
				}
				await updateCachedProfile(did, updates);
			}
		}

		return json({ success: true });
	} catch (err) {
		console.error('Onboarding error:', err);
		return json({ error: 'Failed to complete profile setup.' }, { status: 500 });
	}
};

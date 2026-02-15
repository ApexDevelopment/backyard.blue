import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { resolveDidDocument, getPdsUrl } from '$lib/server/identity.js';
import { getSessionData, setSessionData } from '$lib/server/session.js';

export const load: PageServerLoad = async ({ locals, cookies }) => {
	if (!locals.did) {
		throw redirect(303, '/login');
	}

	if (!locals.needsOnboarding) {
		throw redirect(303, '/');
	}

	// Check if the user has any Bluesky follows.
	// We distinguish "confirmed zero" from "check failed" so a transient
	// network error doesn't silently skip this step forever.
	let hasBlueskyFollows: boolean | null = null; // null = unknown / fetch failed

	try {
		const didDoc = await resolveDidDocument(locals.did);
		const pdsUrl = getPdsUrl(didDoc);

		if (pdsUrl) {
			const url = new URL(`${pdsUrl}/xrpc/com.atproto.repo.listRecords`);
			url.searchParams.set('repo', locals.did);
			url.searchParams.set('collection', 'app.bsky.graph.follow');
			url.searchParams.set('limit', '1');

			const res = await fetch(url.toString());
			if (res.ok) {
				const data = await res.json();
				hasBlueskyFollows = data.records?.length > 0;
			}
		} else {
			// No PDS URL means we can't check — treat as confirmed zero
			hasBlueskyFollows = false;
		}
	} catch {
		// Fetch failed — leave hasBlueskyFollows as null
	}

	// Only skip this step when we've *confirmed* zero follows.
	// On fetch failure (null) we render the page and let the user choose.
	if (hasBlueskyFollows === false) {
		const session = getSessionData(cookies);
		setSessionData(cookies, { ...session, needsOnboarding: false });
		throw redirect(303, '/');
	}

	return {};
};

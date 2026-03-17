import { redirect } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { getOAuthClient } from '$lib/server/oauth.js';
import { setSessionData } from '$lib/server/session.js';
import { backfillUser } from '$lib/server/backfill.js';
import { canSignIn, getSignupMode } from '$lib/server/signup.js';
import { getBackyardProfileRecord, hasAnyBackyardRecords } from '$lib/server/identity.js';

/**
 * OAuth callback handler.
 * Completes the authorization flow, checks signup gating, and stores the session.
 * New users (those without a Backyard profile) are redirected to /onboarding.
 */
export const GET: RequestHandler = async (event) => {
	const params = new URLSearchParams(event.url.search);
	let redirectTo = '/';

	try {
		const client = await getOAuthClient();
		const { session: oauthSession } = await client.callback(params);

		// ── Signup gating ───────────────────────────────────────────────
		// The OAuth handshake succeeded, but the user may not be allowed
		// to use this instance if signups are restricted.
		const { allowed, reason } = await canSignIn(oauthSession.did);
		if (!allowed) {
			const mode = getSignupMode();
			const errorParam = mode === 'closed' ? 'signups_closed' : 'not_allowed';
			throw redirect(303, `/login?error=${errorParam}`);
		}

		// ── Onboarding check ────────────────────────────────────────────
		// If the user doesn't have a Backyard profile, check whether they
		// have any other Backyard records (posts, follows, etc.). Only
		// flag for onboarding if they are truly new to the platform.
		let needsOnboarding = false;
		try {
			const backyardProfile = await getBackyardProfileRecord(oauthSession.did);
			if (!backyardProfile) {
				const hasRecords = await hasAnyBackyardRecords(oauthSession.did);
				if (!hasRecords) {
					needsOnboarding = true;
					redirectTo = '/onboarding';
				}
			}
		} catch {
			// If the check fails, don't block login — they can always set
			// up their profile later.
		}

		// Store the user's DID in the encrypted cookie session
		setSessionData(event.cookies, {
			did: oauthSession.did,
			...(needsOnboarding ? { needsOnboarding: true } : {})
		});

		// Backfill the user's records from their PDS in the background
		backfillUser(oauthSession.did).catch((err) => {
			console.error('Post-login backfill error:', err);
		});
	} catch (err: any) {
		// Re-throw redirects (they're thrown as "errors" in SvelteKit)
		if (err?.status === 303) throw err;

		console.error('OAuth callback error:', err);
		throw redirect(303, '/login?error=auth_failed');
	}

	throw redirect(303, redirectTo);
};

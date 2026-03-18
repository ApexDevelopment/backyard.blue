import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

/**
 * Proxies account creation to the user's chosen PDS.
 * POST /api/auth/create-account
 * Body: { pds: string, email: string, handle: string, password: string, inviteCode?: string }
 */
export const POST: RequestHandler = async ({ request, fetch: kitFetch }) => {
	let body: any;
	try {
		body = await request.json();
	} catch {
		return json({ error: 'invalid json body' }, { status: 400 });
	}

	const { pds, email, handle, password, inviteCode, verificationCode, verificationPhone } = body;

	if (!pds || typeof pds !== 'string') {
		return json({ error: 'pds is required' }, { status: 400 });
	}
	if (!email || typeof email !== 'string') {
		return json({ error: 'email is required' }, { status: 400 });
	}
	if (!handle || typeof handle !== 'string') {
		return json({ error: 'handle is required' }, { status: 400 });
	}
	if (!password || typeof password !== 'string') {
		return json({ error: 'password is required' }, { status: 400 });
	}

	// Normalize PDS URL
	let pdsUrl: string;
	try {
		let raw = pds.trim();
		if (!/^https?:\/\//i.test(raw)) {
			raw = 'https://' + raw;
		}
		const parsed = new URL(raw);
		if (parsed.protocol !== 'https:') {
			return json({ error: 'pds must use https' }, { status: 400 });
		}
		pdsUrl = parsed.origin;
	} catch {
		return json({ error: 'invalid pds url' }, { status: 400 });
	}

	// Build the createAccount request body
	const createBody: Record<string, string> = {
		email: email.trim(),
		handle: handle.trim(),
		password
	};
	if (inviteCode && typeof inviteCode === 'string' && inviteCode.trim()) {
		createBody.inviteCode = inviteCode.trim();
	}
	if (verificationCode && typeof verificationCode === 'string') {
		createBody.verificationCode = verificationCode;
	}
	if (verificationPhone && typeof verificationPhone === 'string') {
		createBody.verificationPhone = verificationPhone;
	}

	try {
		const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.createAccount`, {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify(createBody)
		});

		if (!res.ok) {
			const errData = await res.json().catch(() => null);
			const message = errData?.message || 'account creation failed';
			return json({ error: message }, { status: res.status });
		}

		// Account created — now initiate OAuth login so they get a session
		const loginRes = await kitFetch('/api/auth/login', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ handle: handle.trim() })
		});

		if (loginRes.ok) {
			const { url } = await loginRes.json();
			return json({ url });
		}

		// Account was created but auto-login failed — tell user to sign in manually
		return json({ created: true, url: '/login' });
	} catch (err) {
		console.error('Create account error:', err);
		return json({ error: 'could not reach the pds. please check the url and try again.' }, { status: 502 });
	}
};

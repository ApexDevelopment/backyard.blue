import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';

export const GET: RequestHandler = async ({ url }) => {
	const pds = url.searchParams.get('pds');
	if (!pds) {
		return json({ error: 'pds parameter is required' }, { status: 400 });
	}

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

	try {
		const res = await fetch(`${pdsUrl}/xrpc/com.atproto.server.describeServer`);
		if (!res.ok) {
			return json({ error: 'could not reach PDS' }, { status: 502 });
		}
		const data = await res.json();
		return json(data);
	} catch {
		return json({ error: 'could not reach the PDS. please check the URL.' }, { status: 502 });
	}
};

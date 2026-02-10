import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { markNotificationsRead, getUnreadCount } from '$lib/server/notifications.js';

/** POST: mark notifications as read */
export const POST: RequestHandler = async ({ request, locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	let body: any;
	try {
		body = await request.json();
	} catch {
		body = {};
	}

	const ids = Array.isArray(body.ids) ? body.ids.filter((id: any) => typeof id === 'number') : undefined;

	try {
		await markNotificationsRead(locals.did, ids);
		return json({ success: true });
	} catch (err) {
		console.error('Mark-read error:', err);
		return json({ error: 'Failed to mark notifications read' }, { status: 500 });
	}
};

/** GET: return unread count */
export const GET: RequestHandler = async ({ locals }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	try {
		const count = await getUnreadCount(locals.did);
		return json({ unreadCount: count });
	} catch (err) {
		console.error('Unread count error:', err);
		return json({ unreadCount: 0 });
	}
};

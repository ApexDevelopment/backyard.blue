import { json } from '@sveltejs/kit';
import type { RequestHandler } from './$types.js';
import { markNotificationsRead, getNotifications, getUnreadCount } from '$lib/server/notifications.js';

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

/** GET: return notifications list + unread count, with optional cursor pagination */
export const GET: RequestHandler = async ({ locals, url }) => {
	if (!locals.did) {
		return json({ error: 'Authentication required' }, { status: 401 });
	}

	try {
		const cursor = url.searchParams.get('cursor') || undefined;
		const limit = Math.min(parseInt(url.searchParams.get('limit') || '50', 10) || 50, 100);

		const [{ items, cursor: nextCursor }, unreadCount] = await Promise.all([
			getNotifications(locals.did, limit, cursor),
			cursor ? Promise.resolve(0) : getUnreadCount(locals.did)
		]);

		return json({ notifications: items, cursor: nextCursor, unreadCount });
	} catch (err) {
		console.error('Notifications fetch error:', err);
		return json({ notifications: [], cursor: null, unreadCount: 0 });
	}
};

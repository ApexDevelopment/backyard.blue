import type { PageServerLoad } from './$types.js';
import { redirect } from '@sveltejs/kit';
import { getNotifications, markNotificationsRead } from '$lib/server/notifications.js';

export const load: PageServerLoad = async ({ locals, url }) => {
	if (!locals.did) {
		throw redirect(302, '/login');
	}

	const cursor = url.searchParams.get('cursor') || undefined;

	try {
		const { items, cursor: nextCursor } = await getNotifications(locals.did, 50, cursor);

		// Mark loaded notifications as read
		const unreadIds = items.filter((n) => !n.read).map((n) => n.id);
		if (unreadIds.length > 0) {
			markNotificationsRead(locals.did, unreadIds).catch(() => {});
		}

		return { notifications: items, cursor: nextCursor };
	} catch (err) {
		console.error('Failed to load notifications:', err);
		return { notifications: [], cursor: null };
	}
};

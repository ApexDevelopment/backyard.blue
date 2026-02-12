import { writable, derived } from 'svelte/store';
import type { BackyardNotification } from '$lib/types.js';

interface NotificationState {
	/** Combined list: live (newest first) then backlog (newest first). */
	items: BackyardNotification[];
	/** Whether we've completed the initial backlog fetch. */
	loaded: boolean;
	/** Cursor for paginating older notifications. */
	cursor: string | null;
	/** Unread count (decremented locally on mark-read, refreshed on backlog fetch). */
	unreadCount: number;
}

const initial: NotificationState = {
	items: [],
	loaded: false,
	cursor: null,
	unreadCount: 0
};

export const notifications = writable<NotificationState>(initial);
export const unreadCount = derived(notifications, ($n) => $n.unreadCount);

/** Maximum notifications kept in memory. Older entries are dropped on overflow. */
const MAX_STORED = 200;

let eventSource: EventSource | null = null;
let pollTimer: ReturnType<typeof setInterval> | null = null;

function pushLive(notif: BackyardNotification) {
	notifications.update((state) => {
		if (state.items.some((n) => n.id === notif.id)) return state;
		const items = [notif, ...state.items];
		if (items.length > MAX_STORED) items.length = MAX_STORED;
		return {
			...state,
			items,
			unreadCount: state.unreadCount + 1
		};
	});
}

/**
 * Fetch the notification backlog and start listening for live events.
 * Call once from the root layout when the user is logged in.
 */
export async function initNotifications(): Promise<void> {
	// Fetch initial backlog
	try {
		const res = await fetch('/api/activity');
		if (res.ok) {
			const data = await res.json();
			notifications.set({
				items: data.notifications ?? [],
				loaded: true,
				cursor: data.cursor ?? null,
				unreadCount: data.unreadCount ?? 0
			});
		}
	} catch {
		// Non-fatal — we'll still start SSE
	}

	// SSE for live delivery
	eventSource = new EventSource('/api/activity/stream');
	eventSource.addEventListener('notification', (e) => {
		try {
			const event = JSON.parse(e.data);
			const actor = event.actorProfile || { did: event.actorDid, handle: event.actorDid };
			pushLive({
				id: event.id,
				actor,
				type: event.type,
				subjectUri: event.subjectUri,
				actionUri: event.actionUri,
				read: false,
				createdAt: event.createdAt
			});
		} catch {}
	});

	// Polling fallback — catches anything SSE misses
	pollTimer = setInterval(async () => {
		try {
			const res = await fetch('/api/activity?limit=10');
			if (!res.ok) return;
			const data = await res.json();
			if (!data.notifications) return;

			notifications.update((state) => {
				const existingIds = new Set(state.items.map((n) => n.id));
				const fresh = (data.notifications as BackyardNotification[]).filter(
					(n) => !existingIds.has(n.id)
				);
				if (fresh.length === 0) return state;
				const items = [...fresh, ...state.items];
				if (items.length > MAX_STORED) items.length = MAX_STORED;
				return {
					...state,
					items,
					unreadCount: data.unreadCount ?? state.unreadCount
				};
			});
		} catch {}
	}, 30_000);
}

/**
 * Load the next page of older notifications (for "load more" on the activity page).
 */
export async function loadMoreNotifications(): Promise<void> {
	let cursor: string | null = null;
	notifications.subscribe((s) => (cursor = s.cursor))();

	if (!cursor) return;

	try {
		const res = await fetch(`/api/activity?cursor=${encodeURIComponent(cursor)}`);
		if (!res.ok) return;
		const data = await res.json();

		notifications.update((state) => {
			const existingIds = new Set(state.items.map((n) => n.id));
			const fresh = (data.notifications as BackyardNotification[]).filter(
				(n) => !existingIds.has(n.id)
			);
			const items = [...state.items, ...fresh];
			const hitCap = items.length > MAX_STORED;
			if (hitCap) items.length = MAX_STORED;
			return {
				...state,
				items,
				// Stop offering pagination if we've hit the memory cap
				cursor: hitCap ? null : (data.cursor ?? null)
			};
		});
	} catch {}
}

/**
 * Mark the given notification IDs as read (or all if no IDs given).
 * Optimistically updates the local state.
 */
export async function markNotificationsRead(ids?: number[]): Promise<void> {
	notifications.update((state) => {
		const idSet = ids ? new Set(ids) : null;
		const items = state.items.map((n) =>
			!n.read && (!idSet || idSet.has(n.id)) ? { ...n, read: true } : n
		);
		const readCount = state.items.filter(
			(n) => !n.read && (!idSet || idSet.has(n.id))
		).length;
		return {
			...state,
			items,
			unreadCount: Math.max(0, state.unreadCount - readCount)
		};
	});

	try {
		await fetch('/api/activity', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ ids })
		});
	} catch {}
}

/**
 * Tear down SSE and polling. Call from layout onDestroy.
 */
export function destroyNotifications(): void {
	eventSource?.close();
	eventSource = null;
	if (pollTimer) {
		clearInterval(pollTimer);
		pollTimer = null;
	}
	notifications.set(initial);
}

<script lang="ts">
	import type { PageData } from './$types.js';
	import type { BackyardNotification } from '$lib/types.js';
	import { Heart, MessageCircle, Repeat2, UserPlus, XCircle } from 'lucide-svelte';
	import { onMount, onDestroy } from 'svelte';
	import { invalidateAll } from '$app/navigation';

	let { data }: { data: PageData } = $props();

	let initialLoadFailed = false;
	let liveNotifications: BackyardNotification[] = $state([]);
	let eventSource: EventSource | null = null;
	let pollTimer: ReturnType<typeof setInterval> | null = null;

	function pushLive(notif: BackyardNotification) {
		if (liveNotifications.some((n) => n.id === notif.id)) return;
		liveNotifications = [notif, ...liveNotifications];
	}

	onMount(() => {
		// SSE for instant delivery
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

				fetch('/api/activity', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ ids: [event.id] })
				}).catch(() => {
					// If we completely fail to load any notifications, we alert the user
					if (liveNotifications.length === 0) {
						initialLoadFailed = true;
						// We will keep the listeners running in case we recover.
					}
				});
			} catch {}
		});

		// Polling fallback — catches anything SSE misses
		pollTimer = setInterval(async () => {
			try {
				const res = await fetch('/api/activity');
				if (!res.ok) return;
				const { unreadCount } = await res.json();
				if (unreadCount > 0) {
					liveNotifications = [];
					await invalidateAll();
				}
			} catch {}
		}, 15_000);
	});

	function destroy() {
		eventSource?.close();
		if (pollTimer) clearInterval(pollTimer);
	}

	onDestroy(destroy);

	let allNotifications = $derived([...liveNotifications, ...data.notifications]);

	function postHref(uri: string): string {
		const stripped = uri.replace('at://', '');
		const parts = stripped.split('/');
		return `/post/${encodeURIComponent(parts[0])}/${encodeURIComponent(parts[2])}`;
	}

	function profileHref(handle: string): string {
		return `/profile/${encodeURIComponent(handle)}`;
	}

	function formatDate(dateStr: string): string {
		const date = new Date(dateStr);
		const now = new Date();
		const diffMs = now.getTime() - date.getTime();
		const diffMins = Math.floor(diffMs / 60000);
		const diffHours = Math.floor(diffMs / 3600000);
		const diffDays = Math.floor(diffMs / 86400000);

		if (diffMins < 1) return 'just now';
		if (diffMins < 60) return `${diffMins}m`;
		if (diffHours < 24) return `${diffHours}h`;
		if (diffDays < 7) return `${diffDays}d`;
		return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
	}

	function actionLabel(type: string): string {
		switch (type) {
			case 'like': return 'liked your post';
			case 'comment': return 'commented on your post';
			case 'reblog': return 'reblogged your post';
			case 'follow': return 'followed you';
			default: return 'interacted with you';
		}
	}
</script>

<svelte:window on:beforeunload={destroy} />

<svelte:head>
	<title>activity — backyard</title>
</svelte:head>

<div class="activity-page">
	<h1 class="page-title">activity</h1>

	{#if initialLoadFailed}
		<div class="error-notice">
			<div class="icon-wrapper">
				<XCircle size={20} />
			</div>
			<span>failed to load notifications, try refreshing.</span>
		</div>
	{/if}

	{#if allNotifications.length > 0}
		<div class="notification-list">
			{#each allNotifications as notif (notif.id)}
				{@const href = notif.type === 'follow'
					? profileHref(notif.actor.handle)
					: notif.subjectUri ? postHref(notif.subjectUri) : '#'}
				<a class="notification-item" class:unread={!notif.read} {href}>
					<span class="notification-icon" class:icon-like={notif.type === 'like'} class:icon-comment={notif.type === 'comment'} class:icon-reblog={notif.type === 'reblog'} class:icon-follow={notif.type === 'follow'}>
						{#if notif.type === 'like'}
							<Heart size={16} />
						{:else if notif.type === 'comment'}
							<MessageCircle size={16} />
						{:else if notif.type === 'reblog'}
							<Repeat2 size={16} />
						{:else if notif.type === 'follow'}
							<UserPlus size={16} />
						{/if}
					</span>

					<div class="notification-details">
						<div class="notification-body">
							{#if notif.actor.avatar}
								<img src={notif.actor.avatar} alt="" class="avatar avatar-sm" />
							{:else}
								<div class="avatar avatar-sm avatar-placeholder">
									{(notif.actor.displayName || notif.actor.handle).charAt(0).toUpperCase()}
								</div>
							{/if}

							<div class="notification-text">
								<span class="actor-name">{notif.actor.displayName || notif.actor.handle}</span>
								<span class="action">{actionLabel(notif.type)}</span>
								<span class="time">{formatDate(notif.createdAt)}</span>
							</div>
						</div>

						{#if notif.subjectPreview}
							<p class="subject-preview">{notif.subjectPreview}</p>
						{/if}
					</div>
				</a>
			{/each}
		</div>

		{#if data.cursor}
			<div class="load-more">
				<a href="/activity?cursor={data.cursor}" class="btn btn-secondary">load more</a>
			</div>
		{/if}
	{:else}
		<div class="empty-state">
			<p>no activity yet. when people interact with your posts, you'll see it here.</p>
		</div>
	{/if}
</div>

<style>
	.activity-page {
		display: flex;
		flex-direction: column;
	}

	.page-title {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: var(--text-primary);
	}

	.notification-list {
		display: flex;
		flex-direction: column;
	}

	.notification-item {
		display: flex;
		align-items: flex-start;
		gap: 0.625rem;
		padding: 0.75rem 0.875rem;
		border-bottom: 1px solid var(--border-light);
		text-decoration: none;
		color: inherit;
		transition: background-color 0.15s ease;
	}

	.notification-item:hover {
		background-color: var(--bg-hover);
		text-decoration: none;
	}

	.notification-item.unread {
		background-color: var(--accent-light);
	}

	.notification-details {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		min-width: 0;
		flex: 1;
	}

	.notification-body {
		display: flex;
		align-items: center;
		gap: 0.5rem;
	}

	.notification-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 28px;
		height: 28px;
		border-radius: var(--radius-full);
		flex-shrink: 0;
	}

	.icon-like {
		color: var(--danger);
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
	}

	.icon-comment {
		color: var(--accent);
		background-color: var(--accent-light);
	}

	.icon-reblog {
		color: var(--success);
		background-color: color-mix(in srgb, var(--success) 10%, transparent);
	}

	.icon-follow {
		color: var(--text-link);
		background-color: color-mix(in srgb, var(--text-link) 10%, transparent);
	}

	.notification-text {
		display: flex;
		flex-wrap: wrap;
		align-items: baseline;
		gap: 0.25rem;
		font-size: 0.9375rem;
		line-height: 1.4;
		min-width: 0;
	}

	.actor-name {
		font-weight: 600;
		color: var(--text-primary);
	}

	.action {
		color: var(--text-secondary);
	}

	.time {
		color: var(--text-tertiary);
		font-size: 0.8125rem;
	}

	.subject-preview {
		margin-left: calc(32px + 0.5rem);
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		line-height: 1.4;
		overflow: hidden;
		text-overflow: ellipsis;
		white-space: nowrap;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		font-size: 0.75rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9375rem;
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}

	.error-notice {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		line-height: 1.4;
		margin-bottom: 1rem;
	}

	.icon-wrapper {
		display: flex;
		flex-shrink: 0;
	}
</style>

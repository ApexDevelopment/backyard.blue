<script lang="ts">
	import { Heart, MessageCircle, Repeat2, UserPlus } from 'lucide-svelte';
	import { onMount } from 'svelte';
	import {
		notifications as notifStore,
		loadMoreNotifications,
		markNotificationsRead
	} from '$lib/stores/notifications.js';

	let items = $derived($notifStore.items);
	let loaded = $derived($notifStore.loaded);
	let cursor = $derived($notifStore.cursor);

	onMount(() => {
		// Mark all currently-unread notifications as read when the page is viewed
		const unreadIds = $notifStore.items.filter((n) => !n.read).map((n) => n.id);
		if (unreadIds.length > 0) {
			markNotificationsRead(unreadIds);
		}

		// Also mark any future ones that arrive while we're on this page
		return notifStore.subscribe((state) => {
			const fresh = state.items.filter((n) => !n.read).map((n) => n.id);
			if (fresh.length > 0) {
				markNotificationsRead(fresh);
			}
		});
	});

	let loadingMore = $state(false);

	async function handleLoadMore() {
		loadingMore = true;
		await loadMoreNotifications();
		loadingMore = false;
	}

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

<svelte:head>
	<title>activity — backyard</title>
</svelte:head>

<div class="activity-page">
	<h1 class="page-title">activity</h1>

	{#if !loaded}
		<div class="empty-state">
			<p>loading notifications…</p>
		</div>
	{:else if items.length > 0}
		<div class="notification-list">
			{#each items as notif (notif.id)}
				{@const href = notif.type === 'follow'
					? profileHref(notif.actor.handle)
					: notif.subjectUri ? postHref(notif.subjectUri) : '#'}
				<a class="notification-item" {href}>
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

		{#if cursor}
			<div class="load-more">
				<button class="btn btn-secondary" onclick={handleLoadMore} disabled={loadingMore}>
					{loadingMore ? 'loading…' : 'load more'}
				</button>
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
</style>

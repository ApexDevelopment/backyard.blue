<script lang="ts">
	import type { PageData } from './$types.js';
	import { ChevronLeft } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>people {data.displayName || `@${data.handle}`} follows — backyard</title>
</svelte:head>

<div class="following-page">
	<div class="page-header">
		<a href="/profile/{data.handle}" class="back-link">
			<ChevronLeft size={18} />
			<span>@{data.handle}</span>
		</a>
		<h1>following</h1>
	</div>

	<div class="follows-list card">
		{#if data.follows && data.follows.length > 0}
			{#each data.follows as follow (follow.did)}
				<a href="/profile/{follow.handle}" class="follow-item">
					{#if follow.avatar}
						<img src={follow.avatar} alt="" class="avatar" />
					{:else}
						<div class="avatar avatar-placeholder">
							{(follow.displayName || follow.handle).charAt(0).toUpperCase()}
						</div>
					{/if}
					<div class="follow-info">
						<span class="follow-name">{follow.displayName || follow.handle}</span>
						<span class="follow-handle">@{follow.handle}</span>
					</div>
				</a>
			{/each}
		{:else}
			<div class="empty-state">
				<p>not following anyone yet.</p>
			</div>
		{/if}
	</div>

	{#if data.cursor}
		<div class="load-more">
			<a href="/profile/{data.handle}/following?cursor={data.cursor}" class="btn btn-secondary">
				load more
			</a>
		</div>
	{/if}
</div>

<style>
	.following-page {
		display: flex;
		flex-direction: column;
	}

	.page-header {
		margin-bottom: 1rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	.back-link:hover {
		color: var(--text-link);
	}

	.page-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.follows-list {
		overflow: hidden;
	}

	.follow-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		text-decoration: none;
		color: var(--text-primary);
		transition: background-color 0.15s ease;
	}

	.follow-item:hover {
		background-color: var(--bg-hover);
		text-decoration: none;
	}

	.follow-item:not(:last-child) {
		border-bottom: 1px solid var(--border-light);
	}

	.follow-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
	}

	.follow-name {
		font-weight: 600;
		font-size: 0.9375rem;
		white-space: nowrap;
		overflow: hidden;
		text-overflow: ellipsis;
	}

	.follow-handle {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		color: var(--text-secondary);
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}
</style>

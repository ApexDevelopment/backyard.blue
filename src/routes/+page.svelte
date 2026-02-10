<script lang="ts">
	import PostCard from '$lib/components/PostCard.svelte';
	import type { PageData } from './$types.js';
	import { Repeat2 } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>feed — backyard</title>
</svelte:head>

<div class="feed-page">
	{#if !data.user}
		<div class="welcome-card card">
			<h2>welcome to the backyard</h2>
			<p>a cozy corner of the atmosphere. sign in to start posting and connect with others.</p>
			<a href="/login" class="btn btn-primary">sign in to get started</a>
		</div>
	{/if}

	<div class="feed">
		{#if data.feed && data.feed.length > 0}
			{#each data.feed as item (item.post.uri + (item.reblog?.uri || ''))}
				{#if item.type === 'reblog' && item.reblog && (!item.chain || item.chain.length <= 1)}
					<!-- Silent reblog (no additions chain): show indicator -->
					<div class="reblog-indicator">
						<Repeat2 size={14} />
						<a href="/profile/{item.reblog.by.handle}">{item.reblog.by.displayName || item.reblog.by.handle}</a> reblogged
					</div>
				{/if}
				<PostCard post={item.post} chain={item.chain} />
			{/each}
		{:else if data.user}
			<div class="empty-state">
				<p>your feed is empty. follow some people to see their posts here!</p>
				<a href="/search" class="btn btn-secondary">find people to follow</a>
			</div>
		{/if}
	</div>

	{#if data.cursor}
		<div class="load-more">
			<a href="/?cursor={data.cursor}" class="btn btn-secondary">load more</a>
		</div>
	{/if}
</div>

<style>
	.feed-page {
		display: flex;
		flex-direction: column;
	}

	.welcome-card {
		padding: 2rem;
		text-align: center;
		margin-bottom: 0.5rem;
	}

	.welcome-card h2 {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 0.5rem;
		color: var(--text-primary);
	}

	.welcome-card p {
		color: var(--text-secondary);
		font-size: 0.9375rem;
		margin-bottom: 1rem;
	}

	.feed {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.reblog-indicator {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem 0;
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.reblog-indicator a {
		color: var(--text-secondary);
		font-weight: 600;
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9375rem;
	}

	.empty-state p {
		margin-bottom: 1rem;
	}

	.load-more {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}
</style>

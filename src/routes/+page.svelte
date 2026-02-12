<script lang="ts">
	import PostCard from '$lib/components/PostCard.svelte';
	import type { PageData } from './$types.js';

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
	{:else}
		<div class="feed">
			{#if data.feed && data.feed.length > 0}
				{#each data.feed as item (item.post.uri + (item.reblog?.uri || ''))}
					<PostCard post={item.post} chain={item.chain} reblog={item.reblog} viewerDid={data.user?.did} />
				{/each}
			{:else}
				<div class="empty-state">
					<p>your feed is empty. follow some people to see their posts here!</p>
					<a href="/search" class="btn btn-secondary">find people to follow</a>
				</div>
			{/if}
		</div>
	{/if}

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

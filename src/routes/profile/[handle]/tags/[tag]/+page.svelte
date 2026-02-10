<script lang="ts">
	import PostCard from '$lib/components/PostCard.svelte';
	import type { PageData } from './$types.js';
	import { Hash, Repeat2 } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>#{data.tag} by @{data.profile.handle} — backyard</title>
</svelte:head>

<div class="tag-page">
	<div class="tag-header card">
		<span class="tag-icon"><Hash size={20} /></span>
		<div class="tag-header-text">
			<h1>{data.tag}</h1>
			<p class="tag-subtitle">
				posts by <a href="/profile/{data.profile.handle}">@{data.profile.handle}</a>
			</p>
		</div>
	</div>

	<div class="feed-list">
		{#if data.feed && data.feed.length > 0}
			{#each data.feed as item (item.post.uri + (item.reblog?.uri || ''))}
				{#if item.type === 'reblog' && item.reblog && (!item.chain || item.chain.length <= 1)}
					<div class="reblog-indicator">
						<Repeat2 size={14} />
						reblogged
					</div>
				{/if}
				<PostCard post={item.post} chain={item.chain} profileHandle={data.profile.handle} />
			{/each}
		{:else}
			<div class="empty-state card">
				<p>no posts tagged #{data.tag} by @{data.profile.handle} yet.</p>
			</div>
		{/if}
	</div>

	{#if data.cursor}
		<div class="load-more">
			<a
				href="/profile/{data.profile.handle}/tags/{encodeURIComponent(data.tag)}?cursor={data.cursor}"
				class="btn btn-secondary"
			>
				load more
			</a>
		</div>
	{/if}
</div>

<style>
	.tag-page {
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.tag-header {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 1rem 1.25rem;
	}

	.tag-icon {
		display: flex;
		color: var(--accent);
		flex-shrink: 0;
	}

	.tag-header-text {
		display: flex;
		flex-direction: column;
	}

	.tag-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
	}

	.tag-subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
	}

	.tag-subtitle a {
		color: var(--text-link);
		text-decoration: none;
	}

	.tag-subtitle a:hover {
		text-decoration: underline;
	}

	.feed-list {
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

<script lang="ts">
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import type { PageData } from './$types.js';
	import { Repeat2 } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>{data.profile.displayName || `@${data.profile.handle}`} — backyard</title>
</svelte:head>

<div class="profile-page">
	<ProfileCard
		profile={data.profile}
		isOwnProfile={data.isOwnProfile}
		isFollowing={data.isFollowing}
		followUri={data.followUri}
		postsCount={data.postsCount}
		followsCount={data.followsCount}
	/>

	<div class="profile-feed">
		<div class="feed-list">
			{#if data.feed && data.feed.length > 0}
				{#each data.feed as item (item.post.uri + (item.reblog?.uri || ''))}
					{#if item.type === 'reblog' && item.reblog && (!item.chain || item.chain.length <= 1)}
						<div class="reblog-indicator">
							<Repeat2 size={14} />
							reblogged
						</div>
					{/if}
					<PostCard post={item.post} chain={item.chain} />
				{/each}
			{:else}
				<div class="empty-state">
					<p>no posts yet.</p>
				</div>
			{/if}
		</div>

		{#if data.cursor}
			<div class="load-more">
				<a href="/profile/{data.profile.handle}?cursor={data.cursor}" class="btn btn-secondary">
					load more
				</a>
			</div>
		{/if}
	</div>
</div>

<style>
	.profile-page {
		display: flex;
		flex-direction: column;
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

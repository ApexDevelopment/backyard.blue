<script lang="ts">
	import ProfileCard from '$lib/components/ProfileCard.svelte';
	import PostCard from '$lib/components/PostCard.svelte';
	import { extractBannerGradient, BANNER_GRADIENT_ENABLED } from '$lib/bannerColors.js';
	import { theme } from '$lib/stores/theme.js';
	import type { PageData } from './$types.js';

	let { data }: { data: PageData } = $props();

	let gradient = $state<string | null>(null);
	let effectGeneration = 0;

	$effect(() => {
		gradient = null;
		const gen = ++effectGeneration;

		if (!BANNER_GRADIENT_ENABLED || !data.profile.banner) return;

		const bannerUrl = data.profile.banner;
		const isDark = $theme === 'dark';

		extractBannerGradient(bannerUrl, isDark).then((g) => {
			if (gen === effectGeneration) gradient = g;
		});
	});
</script>

<svelte:head>
	<title>{data.profile.displayName || `@${data.profile.handle}`} — backyard</title>
</svelte:head>

<div class="profile-page">
	{#if gradient}
		<div class="profile-gradient" style:background={gradient}></div>
	{/if}

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
					<PostCard post={item.post} chain={item.chain} reblog={item.reblog} profileHandle={data.profile.handle} />
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
		position: relative;
		z-index: 0;
	}

	.profile-gradient {
		position: fixed;
		inset: 0;
		z-index: -1;
		opacity: 0;
		animation: gradient-fade-in 0.6s ease forwards;
		pointer-events: none;
	}

	@keyframes gradient-fade-in {
		to {
			opacity: 1;
		}
	}

	.feed-list {
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

	.load-more {
		display: flex;
		justify-content: center;
		padding: 1rem;
	}
</style>

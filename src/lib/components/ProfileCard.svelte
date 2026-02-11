<script lang="ts">
	import type { BackyardProfile } from '$lib/types.js';

	interface Props {
		profile: BackyardProfile;
		isOwnProfile?: boolean;
		isFollowing?: boolean;
		followUri?: string;
		postsCount?: number;
		followsCount?: number;
	}

	let {
		profile,
		isOwnProfile = false,
		isFollowing = false,
		followUri = '',
		postsCount = 0,
		followsCount = 0
	}: Props = $props();

	let followLoading = $state(false);

	async function toggleFollow() {
		if (followLoading) return;
		followLoading = true;

		const wasFollowing = isFollowing;
		const prevUri = followUri;

		// Optimistic update
		isFollowing = !wasFollowing;
		if (wasFollowing) followUri = '';

		try {
			const res = await fetch('/api/follow', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					did: profile.did,
					following: wasFollowing,
					followUri: prevUri
				})
			});
			if (res.ok) {
				const data = await res.json();
				followUri = data.uri || '';
			} else {
				isFollowing = wasFollowing;
				followUri = prevUri;
			}
		} catch {
			isFollowing = wasFollowing;
			followUri = prevUri;
		} finally {
			followLoading = false;
		}
	}
</script>

<div class="profile-card card">
	{#if profile.banner}
		<div class="profile-banner">
			<img src={profile.banner} alt="" />
		</div>
	{:else}
		<div class="profile-banner profile-banner-placeholder"></div>
	{/if}

	<div class="profile-info">
		<div class="profile-avatar-row">
			{#if profile.avatar}
				<img src={profile.avatar} alt="" class="avatar avatar-xl profile-avatar" />
			{:else}
				<div class="avatar avatar-xl profile-avatar avatar-placeholder">
					{(profile.displayName || profile.handle).charAt(0).toUpperCase()}
				</div>
			{/if}

			{#if !isOwnProfile}
				<button
					class="btn {isFollowing ? 'btn-secondary' : 'btn-primary'}"
					onclick={toggleFollow}
					disabled={followLoading}
				>
					{isFollowing ? 'following' : 'follow'}
				</button>
			{:else}
				<a href="/settings/profile" class="btn btn-secondary">edit profile</a>
			{/if}
		</div>

		<div class="profile-names">
			<h1 class="profile-display-name">{profile.displayName || profile.handle}</h1>
			<p class="profile-handle">@{profile.handle}</p>
			{#if profile.pronouns}
				<span class="profile-pronouns">{profile.pronouns}</span>
			{/if}
		</div>

		{#if profile.description}
			<p class="profile-description">{profile.description}</p>
		{/if}

		<div class="profile-stats">
			<span class="stat">
				<strong>{postsCount}</strong> posts
			</span>
			<a href="/profile/{profile.handle}/following" class="stat">
				<strong>{followsCount}</strong> following
			</a>
		</div>
	</div>
</div>

<style>
	.profile-card {
		overflow: hidden;
		margin-bottom: 0.5rem;
	}

	.profile-banner {
		height: 150px;
		overflow: hidden;
	}

	.profile-banner img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.profile-banner-placeholder {
		background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
	}

	.profile-info {
		padding: 0 1rem 1rem;
	}

	.profile-avatar-row {
		display: flex;
		align-items: flex-end;
		justify-content: space-between;
		margin-top: -2rem;
		margin-bottom: 0.75rem;
	}

	.profile-avatar {
		border: 3px solid var(--bg-card);
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 700;
		font-size: 2rem;
	}

	.profile-names {
		margin-bottom: 0.5rem;
	}

	.profile-display-name {
		font-size: 1.25rem;
		font-weight: 700;
		line-height: 1.3;
		color: var(--text-primary);
	}

	.profile-handle {
		font-size: 0.875rem;
		color: var(--text-tertiary);
	}

	.profile-pronouns {
		display: inline-block;
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin-top: 0.125rem;
	}

	.profile-description {
		font-size: 0.9375rem;
		line-height: 1.5;
		color: var(--text-secondary);
		margin-bottom: 0.75rem;
		white-space: pre-wrap;
		word-wrap: break-word;
	}

	.profile-stats {
		display: flex;
		gap: 1rem;
	}

	.stat {
		font-size: 0.875rem;
		color: var(--text-secondary);
		text-decoration: none;
	}

	.stat:hover {
		text-decoration: none;
	}

	.stat strong {
		color: var(--text-primary);
		font-weight: 600;
	}
</style>

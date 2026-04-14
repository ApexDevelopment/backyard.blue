<script lang="ts">
	import type { BackyardProfile } from '$lib/types.js';
	import { linkifyBio } from '$lib/index.js';
	import { Ban, ShieldX } from 'lucide-svelte';
	import ContextMenu from './ContextMenu.svelte';

	interface Props {
		profile: BackyardProfile;
		isOwnProfile?: boolean;
		isFollowing?: boolean;
		followUri?: string;
		postsCount?: number;
		followsCount?: number;
		viewerDid?: string;
		blockedByProfile?: boolean;
		viewerBlockUri?: string | null;
		isAdmin?: boolean;
	}

	let {
		profile,
		isOwnProfile = false,
		isFollowing = false,
		followUri = '',
		postsCount = 0,
		followsCount = 0,
		viewerDid,
		blockedByProfile = false,
		viewerBlockUri = null,
		isAdmin = false
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
	let showBlockOption = $derived(viewerDid && !isOwnProfile);
	let isBlocking = $state(false);

	$effect(() => {
		isBlocking = !!viewerBlockUri;
	});

	let blockUri = $state<string | null>(null);

	$effect(() => {
		blockUri = viewerBlockUri ?? null;
	});

	async function handleBlockUser() {
		try {
			if (isBlocking && blockUri) {
				const res = await fetch('/api/block', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ did: profile.did, blocking: true, blockUri })
				});
				if (res.ok) {
					isBlocking = false;
					blockUri = null;
					window.location.reload();
				}
			} else {
				const res = await fetch('/api/block', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({ did: profile.did })
				});
				if (res.ok) {
					const data = await res.json();
					isBlocking = true;
					blockUri = data.uri;
					window.location.reload();
				}
			}
		} catch {
			// Silently fail
		}
	}

	let showAdminActions = $derived(isAdmin && !isOwnProfile);
	let adminBanLoading = $state(false);

	async function handleAdminBan() {
		if (adminBanLoading) return;
		adminBanLoading = true;
		try {
			const res = await fetch('/api/admin/ban', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({ did: profile.did, reason: 'Banned via profile page' })
			});
			if (res.ok) {
				window.location.reload();
			}
		} finally {
			adminBanLoading = false;
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

			<div class="profile-actions">
				{#if blockedByProfile}
					<!-- No actions available when blocked -->
				{:else if !isOwnProfile}
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

				{#if showBlockOption || showAdminActions}
					<ContextMenu>
						{#snippet children()}
							{#if showBlockOption}
								<button class="context-item {isBlocking ? '' : 'context-item-danger'}" onclick={handleBlockUser}>
									<Ban size={16} />
									<span>{isBlocking ? 'unblock' : 'block'} {profile.displayName || profile.handle}</span>
								</button>
							{/if}
							{#if showAdminActions}
								<button class="context-item context-item-danger" onclick={handleAdminBan} disabled={adminBanLoading}>
									<ShieldX size={16} />
									<span>ban {profile.displayName || profile.handle}</span>
								</button>
							{/if}
						{/snippet}
					</ContextMenu>
				{/if}
			</div>
		</div>

		<div class="profile-names">
			<div class="profile-name-row">
				<h1 class="profile-display-name">{profile.displayName || profile.handle}</h1>
				{#if profile.displayName}
					<span class="profile-handle">@{profile.handle}</span>
				{/if}
			</div>
			{#if profile.pronouns}
				<span class="pronouns-badge">{profile.pronouns}</span>
			{/if}
		</div>

		{#if profile.description}
			<p class="profile-description">{@html linkifyBio(profile.description)}</p>
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
		z-index: 1;
		overflow: hidden;
		margin-bottom: 0.75rem;
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

	@media (max-width: 640px) {
		.profile-banner {
			margin-left: -0.75rem;
			margin-right: -0.75rem;
		}
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

	.profile-actions {
		display: flex;
		align-items: center;
		gap: 0.5rem;
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

	.profile-name-row {
		display: flex;
		align-items: baseline;
		gap: 0.5rem;
		flex-wrap: wrap;
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

	.pronouns-badge {
		display: inline-block;
		width: fit-content;
		font-size: 0.75rem;
		color: var(--text-secondary);
		background-color: color-mix(in srgb, var(--text-tertiary) 18%, transparent);
		padding: 0.0625rem 0.4375rem;
		border-radius: var(--radius-sm);
		margin-top: 0.25rem;
		line-height: 1.5;
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

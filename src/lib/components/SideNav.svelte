<script lang="ts">
	import { page } from '$app/stores';
	import { House, Search, Bell, User, Settings, Shield } from 'lucide-svelte';
	import type { BackyardProfile } from '$lib/types.js';

	interface Props {
		user?: BackyardProfile | null;
		unreadNotifications?: number;
		onnavigate?: () => void;
		drawer?: boolean;
		isAdmin?: boolean;
	}

	let { user = null, unreadNotifications = 0, onnavigate, drawer = false, isAdmin = false }: Props = $props();

	let currentPath = $derived($page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/') return currentPath === '/';
		return currentPath.startsWith(href);
	}

	let profileHref = $derived(user ? `/profile/${user.handle}` : '/login');
</script>

<nav class="sidenav" class:drawer aria-label="Main navigation">
	<a href="/" class="sidenav-item" class:active={isActive('/')} onclick={onnavigate}>
		<House size={20} />
		<span class="sidenav-label">home</span>
	</a>
	<a href="/search" class="sidenav-item" class:active={isActive('/search')} onclick={onnavigate}>
		<Search size={20} />
		<span class="sidenav-label">search</span>
	</a>
	<a href="/activity" class="sidenav-item" class:active={isActive('/activity')} onclick={onnavigate}>
		<span class="sidenav-icon-wrapper">
			<Bell size={20} />
			{#if unreadNotifications > 0}
				<span class="badge">{unreadNotifications > 99 ? '99+' : unreadNotifications}</span>
			{/if}
		</span>
		<span class="sidenav-label">notifications</span>
	</a>
	<a href={profileHref} class="sidenav-item" class:active={currentPath.startsWith('/profile/' + (user?.handle ?? '\0'))} onclick={onnavigate}>
		<User size={20} />
		<span class="sidenav-label">profile</span>
	</a>
	<a href="/settings" class="sidenav-item" class:active={isActive('/settings')} onclick={onnavigate}>
		<Settings size={20} />
		<span class="sidenav-label">settings</span>
	</a>
	{#if isAdmin}
		<a href="/admin" class="sidenav-item" class:active={isActive('/admin')} onclick={onnavigate}>
			<Shield size={20} />
			<span class="sidenav-label">admin</span>
		</a>
	{/if}
</nav>

<style>
	.sidenav {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		z-index: 1;
		position: sticky;
		top: calc(var(--header-height) + 1rem);
		align-self: flex-start;
		justify-self: end;
		width: 12.5rem;
		flex-shrink: 0;
	}

	.sidenav-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.875rem;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		font-size: 0.9375rem;
		font-weight: 500;
		text-decoration: none;
		transition: all 0.15s ease;
	}

	.sidenav-item:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		text-decoration: none;
	}

	.sidenav-item.active {
		color: var(--text-primary);
		background-color: var(--bg-hover);
		font-weight: 600;
	}

	.sidenav-icon-wrapper {
		position: relative;
		display: flex;
		align-items: center;
	}

	.badge {
		position: absolute;
		top: -6px;
		right: -8px;
		min-width: 16px;
		height: 16px;
		padding: 0 4px;
		border-radius: var(--radius-full);
		background-color: var(--danger);
		color: white;
		font-size: 0.625rem;
		font-weight: 700;
		line-height: 16px;
		text-align: center;
	}

	@media (max-width: 960px) {
		.sidenav:not(.drawer) {
			width: auto;
			justify-self: center;
		}

		.sidenav:not(.drawer) .sidenav-label {
			display: none;
		}

		.sidenav:not(.drawer) .sidenav-item {
			justify-content: center;
			padding: 0.625rem;
		}
	}

	@media (max-width: 640px) {
		.sidenav:not(.drawer) {
			display: none;
		}
	}
</style>

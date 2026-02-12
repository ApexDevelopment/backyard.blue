<script lang="ts">
	import { page } from '$app/stores';
	import { House, Bell, User, Settings } from 'lucide-svelte';
	import type { BackyardProfile } from '$lib/types.js';

	interface Props {
		user?: BackyardProfile | null;
	}

	let { user = null }: Props = $props();

	let currentPath = $derived($page.url.pathname);

	function isActive(href: string): boolean {
		if (href === '/') return currentPath === '/';
		return currentPath.startsWith(href);
	}

	let profileHref = $derived(user ? `/profile/${user.handle}` : '/login');
</script>

<nav class="sidenav" aria-label="Main navigation">
	<a href="/" class="sidenav-item" class:active={isActive('/')}>
		<House size={20} />
		<span class="sidenav-label">home</span>
	</a>
	<a href="/activity" class="sidenav-item" class:active={isActive('/activity')}>
		<Bell size={20} />
		<span class="sidenav-label">notifications</span>
	</a>
	<a href={profileHref} class="sidenav-item" class:active={currentPath.startsWith('/profile/' + (user?.handle ?? '\0'))}>
		<User size={20} />
		<span class="sidenav-label">profile</span>
	</a>
	<a href="/settings/profile" class="sidenav-item" class:active={isActive('/settings')}>
		<Settings size={20} />
		<span class="sidenav-label">settings</span>
	</a>
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

	@media (max-width: 960px) {
		.sidenav {
			width: auto;
			justify-self: center;
		}

		.sidenav-label {
			display: none;
		}

		.sidenav-item {
			justify-content: center;
			padding: 0.625rem;
		}
	}

	@media (max-width: 640px) {
		.sidenav {
			display: none;
		}
	}
</style>

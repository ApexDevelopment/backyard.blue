<script lang="ts">
	import ThemeToggle from './ThemeToggle.svelte';
	import { theme, themeMode } from '$lib/stores/theme.js';
	import { toggleMobileNav } from '$lib/stores/mobileNav.js';
	import type { BackyardProfile } from '$lib/types.js';
	import { Plus, Search, LogOut, User, Moon, Sun, Menu } from 'lucide-svelte';

	interface Props {
		user?: BackyardProfile | null;
		onCompose?: () => void;
	}

	let { user = null, onCompose }: Props = $props();

	let menuOpen = $state(false);

	function toggleMenu() {
		menuOpen = !menuOpen;
	}

	async function signOut() {
		console.log('Logging out...');
		await fetch('/logout', { method: 'POST' });
		window.location.href = '/';
		menuOpen = false;
	}

	function onWindowClick(e: MouseEvent) {
		if (menuOpen && e.target instanceof Element && !e.target.closest('.user-menu')) {
			menuOpen = false;
		}
	}
</script>

<svelte:window onclick={onWindowClick} />

<header class="header">
	<div class="header-inner container">
		<button class="hamburger" onclick={toggleMobileNav} aria-label="open navigation menu">
			<Menu size={20} />
		</button>
		<a href="/" class="logo">
			<img src="/backyard-logo.svg" alt="backyard logo" width="24" height="24" />
			<span class="logo-text">backyard</span>
		</a>

		<nav class="nav">
			{#if user}
				<button class="btn btn-primary btn-compose" onclick={onCompose} type="button">
					<Plus size={16} strokeWidth={2.5} />
					<span class="btn-label">post</span>
				</button>
				<a href="/search" class="btn-ghost nav-icon" title="search">
					<Search size={18} />
				</a>

				<div class="user-menu">
					<button class="user-btn" onclick={toggleMenu} aria-label="user menu" aria-expanded={menuOpen}>
						{#if user.avatar}
							<img src={user.avatar} alt={user.displayName || user.handle} class="avatar avatar-sm" />
						{:else}
							<div class="avatar avatar-sm avatar-placeholder">
								{(user.displayName || user.handle).charAt(0).toUpperCase()}
							</div>
						{/if}
					</button>

					{#if menuOpen}
						<div class="menu-dropdown">
							<a href="/profile/{user.handle}" class="menu-item" onclick={() => menuOpen = false}>
								<User size={18} />
								<span>view profile</span>
							</a>
							<button class="menu-item" onclick={() => theme.toggle()}>
							{#if $themeMode === 'light'}
									<Moon size={18} />
								{:else}
									<Sun size={18} />
								{/if}
								<span>switch themes</span>
							</button>
							<button class="menu-item" onclick={signOut}>
								<LogOut size={18} />
								<span>sign out</span>
							</button>
						</div>
					{/if}
				</div>
			{:else}
				<a href="/search" class="btn-ghost nav-icon" title="search">
					<Search size={18} />
				</a>
				<a href="/login" class="btn btn-primary">sign in</a>
				<ThemeToggle />
			{/if}
		</nav>
	</div>
</header>

<style>
	.header {
		position: sticky;
		top: 0;
		z-index: 100;
		background-color: var(--bg-primary);
		border-bottom: 1px solid var(--border-color);
		height: var(--header-height);
	}

	.header-inner {
		display: flex;
		align-items: center;
		justify-content: space-between;
		height: 100%;
		max-width: var(--max-width);
	}

	.hamburger {
		display: none;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-sm);
		color: var(--text-secondary);
		background: none;
		border: none;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.hamburger:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	@media (max-width: 640px) {
		.hamburger {
			display: flex;
		}
	}

	.logo {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		color: var(--text-primary);
		font-weight: 700;
		font-size: 1.125rem;
		text-decoration: none;
	}

	.logo:hover {
		text-decoration: none;
		color: var(--text-primary);
	}

	.logo-text {
		letter-spacing: -0.02em;
	}

	.nav {
		display: flex;
		align-items: center;
		gap: 0.25rem;
	}

	.nav-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		transition: all 0.15s ease;
	}

	.nav-icon:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		text-decoration: none;
	}

	.btn-compose {
		display: inline-flex;
		align-items: stretch;
		gap: 0.25rem;
	}

	.btn-label {
		display: inline;
		line-height: 1;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 600;
		font-size: 0.75rem;
	}

	@media (max-width: 480px) {
		.btn-label {
			display: none;
		}
	}

	/* Menu Styles */
	.user-menu {
		position: relative;
		margin-left: 0.25rem;
	}

	.user-btn {
		display: block;
		padding: 0;
		border-radius: var(--radius-full);
		transition: transform 0.1s ease;
		cursor: pointer;
	}

	.user-btn:active {
		transform: scale(0.95);
	}

	.menu-dropdown {
		position: absolute;
		top: calc(100% + 0.5rem);
		right: 0;
		width: 200px;
		background-color: var(--bg-card);
		border: 1px solid var(--border-color);
		border-radius: var(--radius-md);
		box-shadow: var(--shadow-lg);
		padding: 0.375rem;
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
		z-index: 1000;
		animation: menuFadeIn 0.1s ease-out;
		transform-origin: top right;
	}

	.menu-item {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.625rem 0.75rem;
		border-radius: var(--radius-sm);
		color: var(--text-primary);
		font-size: 0.9375rem;
		text-decoration: none;
		transition: background-color 0.15s ease;
		text-align: left;
		width: 100%;
		font-weight: 500;
		background: none;
		border: none;
		cursor: pointer;
	}

	.menu-item:hover {
		background-color: var(--bg-hover);
		text-decoration: none;
		color: var(--text-primary);
	}

	@keyframes menuFadeIn {
		from {
			opacity: 0;
			transform: scale(0.95);
		}
		to {
			opacity: 1;
			transform: scale(1);
		}
	}
</style>

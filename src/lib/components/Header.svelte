<script lang="ts">
	import ThemeToggle from './ThemeToggle.svelte';
	import type { BackyardProfile } from '$lib/types.js';
	import { House, Plus, Search, LogOut } from 'lucide-svelte';

	interface Props {
		user?: BackyardProfile | null;
		onCompose?: () => void;
	}

	let { user = null, onCompose }: Props = $props();
</script>

<header class="header">
	<div class="header-inner container">
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
				<a href="/profile/{user.handle}" class="user-link" title="your profile">
					{#if user.avatar}
						<img src={user.avatar} alt={user.displayName || user.handle} class="avatar avatar-sm" />
					{:else}
						<div class="avatar avatar-sm avatar-placeholder">
							{(user.displayName || user.handle).charAt(0).toUpperCase()}
						</div>
					{/if}
				</a>
				<form method="POST" action="/logout" onsubmit={async (e) => { e.preventDefault(); await fetch('/logout', { method: 'POST' }); window.location.href = '/'; }}>
					<button type="submit" class="btn-ghost nav-icon" title="sign out">
						<LogOut size={18} />
					</button>
				</form>
			{:else}
				<a href="/search" class="btn-ghost nav-icon" title="search">
					<Search size={18} />
				</a>
				<a href="/login" class="btn btn-primary">sign in</a>
			{/if}
			<ThemeToggle />
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

	.user-link {
		display: flex;
		align-items: center;
		text-decoration: none;
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
</style>

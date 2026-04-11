<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import { browser } from '$app/environment';
	import { goto } from '$app/navigation';
	import Header from '$lib/components/Header.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import NewsPanel from '$lib/components/NewsPanel.svelte';
	import PostComposer from '$lib/components/PostComposer.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import ViolationModal from '$lib/components/ViolationModal.svelte';
	import { theme } from '$lib/stores/theme.js';
	import { fancyProfiles } from '$lib/stores/preferences.js';
	import { composer, openComposer, closeComposer } from '$lib/stores/composer.js';
	import { unreadCount, initNotifications, destroyNotifications } from '$lib/stores/notifications.js';
	import { mobileNavOpen, closeMobileNav } from '$lib/stores/mobileNav.js';
	import type { LayoutData } from './$types.js';

	let { data, children }: { data: LayoutData; children: any } = $props();

	// Intercept 401 responses from API calls and redirect to login
	if (browser) {
		const originalFetch = window.fetch;
		let redirecting = false;
		window.fetch = async function (...args: Parameters<typeof fetch>) {
			const response = await originalFetch.apply(this, args);
			if (response.status === 401 && !redirecting) {
				const url = typeof args[0] === 'string' ? args[0] : args[0] instanceof Request ? args[0].url : '';
				if (url.includes('/api/') && !url.includes('/api/auth/')) {
					redirecting = true;
					await fetch('/logout', { method: 'POST' });
					goto('/login', { replaceState: true });
				}
			}
			return response;
		};
	}

	let hideChrome = $derived(
		$page.url.pathname.startsWith('/onboarding')
		|| $page.url.pathname.startsWith('/login')
	);

	$effect(() => {
		if (data.theme) {
			theme.initialize(data.theme);
		}
	});

	$effect(() => {
		fancyProfiles.initialize(data.fancyProfiles);
	});

	// Bootstrap notification listener when logged in (client-side only)
	let notificationsInitialized = false;
	$effect(() => {
		if (data.user && !notificationsInitialized) {
			notificationsInitialized = true;
			initNotifications();
		}
	});

	onDestroy(() => {
		if (notificationsInitialized) {
			destroyNotifications();
		}
	});

	function handleClose() {
		closeComposer();
	}
</script>

<svelte:head>
	<title>backyard</title>
	<meta property="og:site_name" content="backyard" />
	{#if $page.route.id !== '/profile/[handle]' && $page.route.id !== '/post/[repo]/[rkey]'}
		<meta property="og:title" content="backyard" />
		<meta property="og:description" content="backyard" />
		<meta property="og:type" content="website" />
		<meta property="og:url" content={$page.url.href} />
		<meta property="og:image" content="{$page.url.origin}/banner.svg" />
		<meta name="twitter:card" content="summary_large_image" />
		<meta name="twitter:title" content="backyard" />
		<meta name="twitter:description" content="backyard" />
		<meta name="twitter:image" content="{$page.url.origin}/banner.svg" />
	{/if}
</svelte:head>

<Header user={data.user} onCompose={() => openComposer()} />

<div
	class="drawer-backdrop"
	class:open={$mobileNavOpen}
	onclick={closeMobileNav}
	role="presentation"
></div>
<aside class="drawer" class:open={$mobileNavOpen}>
	<SideNav user={data.user} unreadNotifications={$unreadCount} onnavigate={closeMobileNav} drawer={true} isAdmin={data.isAdmin} />
</aside>

{#if data.user}
	<PullToRefresh />
{/if}

<main class="main">
	<div class="layout" class:layout-full={hideChrome}>
		{#if !hideChrome}
			<SideNav user={data.user} unreadNotifications={$unreadCount} isAdmin={data.isAdmin} />
		{/if}
		<div class="content">
			{@render children()}
		</div>
		{#if !hideChrome}
			<NewsPanel news={data.news} />
		{/if}
	</div>
</main>

{#if !hideChrome && (data.hasTos || data.hasCommunityGuidelines)}
	<footer class="site-footer">
		{#if data.hasTos}
			<a href="/terms_of_service">terms of service</a>
		{/if}
		{#if data.hasCommunityGuidelines}
			<a href="/community_guidelines">community guidelines</a>
		{/if}
	</footer>
{/if}

{#if data.user}
	<PostComposer
		user={data.user}
		bind:open={$composer.open}
		onClose={handleClose}
		mode={$composer.mode}
		reblogUri={$composer.reblogSubject?.uri}
		reblogCid={$composer.reblogSubject?.cid}
		reblogChain={$composer.reblogSubject?.chain}
		editSubject={$composer.editSubject}
	/>
{/if}

{#if data.user && data.hasPendingDeletions}
	<ViolationModal />
{/if}

<style>
	.main {
		padding-top: 1rem;
		padding-bottom: 2rem;
		min-height: calc(100vh - var(--header-height));
	}

	.layout {
		--sidebar-width: 17.5rem;
		--sidenav-icon-width: 3rem;
		display: grid;
		grid-template-columns: var(--sidebar-width) minmax(0, var(--max-width)) var(--sidebar-width);
		justify-content: center;
		gap: 1.5rem;
		margin: 0 auto;
		padding: 0 1rem;
	}

	.content {
		width: 100%;
		max-width: var(--max-width);
		min-width: 0;
	}

	.layout-full {
		display: flex;
		justify-content: center;
		grid-template-columns: unset;
		max-width: var(--max-width);
	}

	/* News panel hidden — two columns: sidenav + content */
	@media (max-width: 1100px) {
		.layout {
			grid-template-columns: var(--sidebar-width) minmax(0, var(--max-width));
		}
	}

	/* Sidenav collapses to icons — narrow first column */
	@media (max-width: 960px) {
		.layout {
			grid-template-columns: var(--sidenav-icon-width) minmax(0, var(--max-width));
		}
	}

	/* Single column — sidenav hidden */
	@media (max-width: 640px) {
		.layout {
			grid-template-columns: minmax(0, var(--max-width));
			padding: 0;
		}

		.content {
			padding: 0 0.75rem;
		}
	}

	/* Slide-out drawer (mobile only) */
	.drawer-backdrop {
		display: none;
	}

	.drawer {
		display: none;
	}

	@media (max-width: 640px) {
		.drawer-backdrop {
			display: block;
			position: fixed;
			inset: 0;
			background-color: rgba(0, 0, 0, 0.4);
			z-index: 200;
			opacity: 0;
			pointer-events: none;
			transition: opacity 0.25s ease;
		}

		.drawer-backdrop.open {
			opacity: 1;
			pointer-events: auto;
		}

		.drawer {
			display: flex;
			position: fixed;
			top: 0;
			left: 0;
			bottom: 0;
			width: 16rem;
			z-index: 201;
			background-color: var(--bg-card);
			border-right: 1px solid var(--border-color);
			box-shadow: var(--shadow-lg);
			padding: 1rem;
			transform: translateX(-100%);
			transition: transform 0.25s ease;
			overflow-y: auto;
		}

		.drawer.open {
			transform: translateX(0);
		}
	}

	.site-footer {
		display: flex;
		justify-content: center;
		gap: 1rem;
		padding: 1.5rem 1rem;
		border-top: 1px solid var(--border-light);
	}

	.site-footer a {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.site-footer a:hover {
		color: var(--text-link);
	}
</style>

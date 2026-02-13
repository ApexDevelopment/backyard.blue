<script lang="ts">
	import '../app.css';
	import { page } from '$app/stores';
	import { onDestroy } from 'svelte';
	import Header from '$lib/components/Header.svelte';
	import SideNav from '$lib/components/SideNav.svelte';
	import NewsPanel from '$lib/components/NewsPanel.svelte';
	import PostComposer from '$lib/components/PostComposer.svelte';
	import PullToRefresh from '$lib/components/PullToRefresh.svelte';
	import { theme } from '$lib/stores/theme.js';
	import { composer, openComposer, closeComposer } from '$lib/stores/composer.js';
	import { unreadCount, initNotifications, destroyNotifications } from '$lib/stores/notifications.js';
	import type { LayoutData } from './$types.js';

	let { data, children }: { data: LayoutData; children: any } = $props();

	let hideChrome = $derived(
		$page.url.pathname.startsWith('/onboarding')
		|| $page.url.pathname.startsWith('/login')
	);

	$effect(() => {
		if (data.theme) {
			theme.initialize(data.theme);
		}
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
</svelte:head>

<Header user={data.user} onCompose={() => openComposer()} />

{#if data.user}
	<PullToRefresh />
{/if}

<main class="main">
	<div class="layout" class:layout-full={hideChrome}>
		{#if !hideChrome}
			<SideNav user={data.user} unreadNotifications={$unreadCount} />
		{/if}
		<div class="content">
			{@render children()}
		</div>
		{#if !hideChrome}
			<NewsPanel news={data.news} />
		{/if}
	</div>
</main>

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
			padding: 0 0.75rem;
		}
	}
</style>

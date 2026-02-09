<script lang="ts">
	import '../app.css';
	import Header from '$lib/components/Header.svelte';
	import PostComposer from '$lib/components/PostComposer.svelte';
	import { theme } from '$lib/stores/theme.js';
	import { composer, openComposer, closeComposer } from '$lib/stores/composer.js';
	import type { LayoutData } from './$types.js';

	let { data, children }: { data: LayoutData; children: any } = $props();

	$effect(() => {
		if (data.theme) {
			theme.initialize(data.theme as 'light' | 'dark');
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

<main class="main">
	<div class="container">
		{@render children()}
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
	/>
{/if}

<style>
	.main {
		padding-top: 1rem;
		padding-bottom: 2rem;
		min-height: calc(100vh - var(--header-height));
	}
</style>

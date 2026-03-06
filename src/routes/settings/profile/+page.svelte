<script lang="ts">
	import type { PageData } from './$types.js';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>edit your profile — backyard</title>
</svelte:head>

<div class="edit-page">
	<h1>edit your profile</h1>

	<ProfileEditor mode="edit" handle={data.handle} initialData={data.initialData} isMirror={!data.hasBackyardProfile} />
</div>

<style>
	.edit-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2rem;
		padding-bottom: 2rem;
		min-height: 60vh;
	}

	.edit-page h1 {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 1.5rem;
		color: var(--text-primary);
	}
</style>

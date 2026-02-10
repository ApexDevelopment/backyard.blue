<script lang="ts">
	import type { PageData } from './$types.js';
	import ProfileEditor from '$lib/components/ProfileEditor.svelte';
	import { House } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>create your profile — backyard</title>
</svelte:head>

<div class="create-page">
	<div class="create-header">
		<House size={32} color="var(--accent)" strokeWidth={2} />
		<h1>create your profile</h1>
		<p class="create-subtitle">
			before you can use backyard, you'll need to set up a profile.
			you can always update it later.
		</p>
	</div>

	<ProfileEditor mode="create" handle={data.handle} />
</div>

<style>
	.create-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		padding-top: 2rem;
		padding-bottom: 2rem;
		min-height: 60vh;
	}

	.create-header {
		text-align: center;
		margin-bottom: 1.5rem;
		max-width: 520px;
	}

	.create-header h1 {
		font-size: 1.375rem;
		font-weight: 700;
		margin-top: 0.75rem;
		color: var(--text-primary);
	}

	.create-subtitle {
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-top: 0.375rem;
		line-height: 1.5;
	}
</style>

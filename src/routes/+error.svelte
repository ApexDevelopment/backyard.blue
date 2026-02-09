<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>Error {$page.status} — Backyard</title>
</svelte:head>

<div class="error-page">
	<h1>{$page.status}</h1>
	<p>{$page.error?.message || 'Something went wrong'}</p>
	<a href="/">Return home</a>
</div>

<style>
	.error-page {
		display: flex;
		flex-direction: column;
		align-items: center;
		justify-content: center;
		min-height: 60vh;
		text-align: center;
		gap: 0.5rem;
	}

	h1 {
		font-size: 4rem;
		margin: 0;
		color: var(--color-primary, #2c5f2d);
	}

	p {
		font-size: 1.25rem;
		color: var(--color-text-secondary, #666);
		margin: 0;
	}

	a {
		margin-top: 1rem;
		color: var(--color-primary, #2c5f2d);
	}
</style>

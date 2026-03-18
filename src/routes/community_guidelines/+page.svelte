<script lang="ts">
	import type { PageData } from './$types.js';
	import { ChevronLeft } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();
</script>

<svelte:head>
	<title>community guidelines — backyard</title>
</svelte:head>

<div class="legal-page">
	<a href="/" class="back-link">
		<ChevronLeft size={16} />
		back
	</a>
	<div class="legal-content card">
		{@html data.html}
	</div>
</div>

<style>
	.legal-page {
		max-width: var(--max-width);
		margin: 0 auto;
		padding: 1rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 1rem;
	}

	.back-link:hover {
		color: var(--text-link);
	}

	.legal-content {
		padding: 2rem;
		font-size: 0.9375rem;
		color: var(--text-primary);
		line-height: 1.6;
	}

	.legal-content :global(h1) {
		font-size: 1.25rem;
		font-weight: 700;
		margin-bottom: 1rem;
		color: var(--text-primary);
	}

	.legal-content :global(h2) {
		font-size: 1.0625rem;
		font-weight: 600;
		margin-top: 1.5rem;
		margin-bottom: 0.75rem;
		color: var(--text-primary);
	}

	.legal-content :global(h3) {
		font-size: 0.9375rem;
		font-weight: 600;
		margin-top: 1.25rem;
		margin-bottom: 0.5rem;
		color: var(--text-primary);
	}

	.legal-content :global(p) {
		margin-bottom: 0.75rem;
	}

	.legal-content :global(ul),
	.legal-content :global(ol) {
		margin-bottom: 0.75rem;
		padding-left: 1.5rem;
	}

	.legal-content :global(li) {
		margin-bottom: 0.375rem;
	}

	.legal-content :global(a) {
		color: var(--text-link);
	}

	.legal-content :global(a:hover) {
		color: var(--text-link-hover);
	}

	.legal-content :global(pre) {
		white-space: pre-wrap;
		word-wrap: break-word;
		font-family: var(--font-sans);
	}

	.legal-content :global(blockquote) {
		border-left: 3px solid var(--border-color);
		padding-left: 1rem;
		margin-left: 0;
		margin-bottom: 0.75rem;
		color: var(--text-secondary);
	}
</style>

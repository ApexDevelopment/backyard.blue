<script lang="ts">
	import { theme } from '$lib/stores/theme.js';
	import { Moon, Sun } from 'lucide-svelte';

	function toggle() {
		theme.toggle();
	}

	let currentTheme: string;
	theme.subscribe((t) => (currentTheme = t));
</script>

<button
	class="theme-toggle btn-ghost"
	onclick={toggle}
	aria-label="toggle {currentTheme === 'light' ? 'dark' : 'light'} mode"
	title="toggle theme"
>
	{#if currentTheme === 'light'}
		<Moon size={18} />
	{:else}
		<Sun size={18} />
	{/if}
</button>

<style>
	.theme-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		transition: all 0.15s ease;
	}

	.theme-toggle:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}
</style>

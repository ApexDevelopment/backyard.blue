<script lang="ts">
	import { theme, themeMode } from '$lib/stores/theme.js';
	import { Moon, Sun } from 'lucide-svelte';

	function toggle() {
		theme.toggle();
	}

	let mode: string;
	themeMode.subscribe((m) => (mode = m));
</script>

<button
	class="theme-toggle btn-ghost"
	onclick={toggle}
	aria-label="toggle {mode === 'light' ? 'dark' : 'light'} mode"
	title="toggle theme"
>
	{#if mode === 'light'}
		<Moon size={20} />
	{:else}
		<Sun size={20} />
	{/if}
</button>

<style>
	.theme-toggle {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 36px;
		height: 36px;
		padding: 0;
		border-radius: var(--radius-full);
		color: var(--text-secondary);
		transition: all 0.15s ease;
	}

	.theme-toggle:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}
</style>

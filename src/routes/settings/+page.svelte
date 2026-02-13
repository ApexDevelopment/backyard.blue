<script lang="ts">
	import { theme, themeMode, themeScheme, COLOR_SCHEMES } from '$lib/stores/theme.js';
	import { fancyProfiles } from '$lib/stores/preferences.js';
	import { Moon, Sun } from 'lucide-svelte';
	import type { ColorScheme } from '$lib/types.js';

	let mode: string;
	themeMode.subscribe((m) => (mode = m));

	let scheme: string;
	themeScheme.subscribe((s) => (scheme = s));

	let fancy: boolean;
	fancyProfiles.subscribe((v) => (fancy = v));

	function handleSchemeChange(e: Event) {
		const value = (e.target as HTMLSelectElement).value as ColorScheme;
		theme.setScheme(value);
	}
</script>

<svelte:head>
	<title>settings — backyard</title>
</svelte:head>

<div class="settings-page">
	<h1>settings</h1>

	<section class="settings-section card">
		<h2>appearance</h2>

		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">color scheme</span>
				<span class="setting-description">choose the color palette for your backyard</span>
			</div>
			<select class="input setting-select" value={scheme} onchange={handleSchemeChange}>
				{#each COLOR_SCHEMES as cs (cs.id)}
					<option value={cs.id}>{cs.label}</option>
				{/each}
			</select>
		</div>

		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">dark mode</span>
				<span class="setting-description">switch between light and dark variants</span>
			</div>
			<button class="mode-toggle" onclick={() => theme.toggle()} aria-label="toggle dark mode">
				<span class="mode-toggle-track" class:dark={mode === 'dark'}>
					<span class="mode-toggle-thumb">
						{#if mode === 'light'}
							<Sun size={14} />
						{:else}
							<Moon size={14} />
						{/if}
					</span>
				</span>
			</button>
		</div>

		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">fancy profiles</span>
				<span class="setting-description">tint the page with a gradient sampled from each user's banner image</span>
			</div>
			<button class="mode-toggle" onclick={() => fancyProfiles.toggle()} aria-label="toggle fancy profiles">
				<span class="mode-toggle-track" class:dark={fancy}>
					<span class="mode-toggle-thumb"></span>
				</span>
			</button>
		</div>
	</section>

	<section class="settings-section card">
		<h2>profile</h2>

		<div class="setting-row">
			<div class="setting-info">
				<span class="setting-label">edit profile</span>
				<span class="setting-description">update your display name, bio, avatar, and more</span>
			</div>
			<a href="/settings/profile" class="btn btn-secondary">edit</a>
		</div>
	</section>
</div>

<style>
	.settings-page {
		display: flex;
		flex-direction: column;
		gap: 1.5rem;
		padding-bottom: 2rem;
	}

	.settings-page h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.settings-section {
		padding: 1.25rem;
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.settings-section h2 {
		font-size: 0.8125rem;
		font-weight: 600;
		letter-spacing: 0.02em;
		color: var(--text-tertiary);
		margin-bottom: 0.25rem;
	}

	.setting-row {
		display: flex;
		align-items: center;
		justify-content: space-between;
		gap: 1rem;
		padding: 0.5rem 0;
	}

	.setting-row + .setting-row {
		border-top: 1px solid var(--border-light);
		padding-top: 1rem;
	}

	.setting-info {
		display: flex;
		flex-direction: column;
		gap: 0.125rem;
	}

	.setting-label {
		font-weight: 500;
		color: var(--text-primary);
		font-size: 0.9375rem;
	}

	.setting-description {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.setting-select {
		width: auto;
		min-width: 10rem;
		padding: 0.375rem 0.75rem;
	}

	/* Toggle switch */
	.mode-toggle {
		flex-shrink: 0;
	}

	.mode-toggle-track {
		display: flex;
		align-items: center;
		width: 3rem;
		height: 1.625rem;
		border-radius: var(--radius-sm);
		background-color: var(--bg-tertiary);
		border: 1px solid var(--border-color);
		padding: 0.125rem;
		transition: background-color 0.2s ease, border-color 0.2s ease;
		cursor: pointer;
	}

	.mode-toggle-track.dark {
		background-color: var(--accent);
		border-color: var(--accent);
	}

	.mode-toggle-thumb {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.375rem;
		height: 1.375rem;
		border-radius: calc(var(--radius-sm) - 2px);
		background-color: var(--bg-card);
		box-shadow: var(--shadow-sm);
		transition: transform 0.2s ease;
		color: var(--text-secondary);
	}

	.mode-toggle-track.dark .mode-toggle-thumb {
		transform: translateX(calc(1.375rem - 2px));
		color: var(--accent);
	}
</style>

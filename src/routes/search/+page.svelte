<script lang="ts">
	import type { PageData } from './$types.js';
	import { Search, User, Hash } from 'lucide-svelte';

	let { data }: { data: PageData } = $props();

	let searchQuery = $state(data.query || '');
	let mode = $state(data.mode || 'profiles');
</script>

<svelte:head>
	<title>{data.query ? `"${data.query}" — search` : 'search'} — backyard</title>
</svelte:head>

<div class="search-page">
	<form method="GET" action="/search" class="search-form">
		<div class="search-input-wrapper">
			<span class="search-icon">
				<Search size={18} />
			</span>
			<input
				type="search"
				name="q"
				class="input search-input"
				placeholder={mode === 'tags' ? 'search for tags...' : 'search for people...'}
				bind:value={searchQuery}
				autofocus
			/>
		</div>
		<input type="hidden" name="mode" value={mode} />
	</form>

	<div class="mode-toggle">
		<a
			href="/search?q={encodeURIComponent(searchQuery)}&mode=profiles"
			class="mode-btn"
			class:active={mode === 'profiles'}
			onclick={(e) => { mode = 'profiles'; }}
		>
			<User size={15} />
			profiles
		</a>
		<a
			href="/search?q={encodeURIComponent(searchQuery)}&mode=tags"
			class="mode-btn"
			class:active={mode === 'tags'}
			onclick={(e) => { mode = 'tags'; }}
		>
			<Hash size={15} />
			tags
		</a>
	</div>

	{#if data.query && mode === 'profiles'}
		<div class="results-header">
			<h2>results for "{data.query}"</h2>
			<span class="result-count">{data.profileResults.length} found</span>
		</div>
	{/if}

	{#if data.query && mode === 'tags'}
		<div class="results-header">
			<h2>tags matching "{data.query}"</h2>
			<span class="result-count">{data.tagResults.length} found</span>
		</div>
	{/if}

	{#if mode === 'profiles'}
		{#if data.profileResults && data.profileResults.length > 0}
			<div class="results-list card">
				{#each data.profileResults as profile (profile.did)}
					<a href="/profile/{profile.handle}" class="result-item">
						{#if profile.avatar}
							<img src={profile.avatar} alt="" class="avatar" />
						{:else}
							<div class="avatar avatar-placeholder">
								{(profile.displayName || profile.handle).charAt(0).toUpperCase()}
							</div>
						{/if}
						<div class="result-info">
							<span class="result-name">{profile.displayName || profile.handle}</span>
							<span class="result-handle">@{profile.handle}</span>
							{#if profile.description}
								<p class="result-desc">{profile.description}</p>
							{/if}
						</div>
					</a>
				{/each}
			</div>
		{:else if data.query}
			<div class="empty-state card">
				<p>no profiles found for "{data.query}".</p>
				<p class="hint">try searching for a handle like "alice.bsky.social" or a display name.</p>
			</div>
		{/if}
	{:else if mode === 'tags'}
		{#if data.tagResults && data.tagResults.length > 0}
			<div class="results-list card">
				{#each data.tagResults as result (result.tag)}
					<a href="/tags/{encodeURIComponent(result.tag)}" class="result-item tag-result-item">
						<span class="tag-result-icon"><Hash size={18} /></span>
						<div class="result-info">
							<span class="result-name">{result.tag}</span>
							<span class="result-handle">{result.count} post{result.count === 1 ? '' : 's'}</span>
						</div>
					</a>
				{/each}
			</div>
		{:else if data.query}
			<div class="empty-state card">
				<p>no tags found matching "{data.query}".</p>
				<p class="hint">try a shorter or more general term.</p>
			</div>
		{/if}
	{/if}
</div>

<style>
	.search-page {
		display: flex;
		flex-direction: column;
		gap: 1rem;
	}

	.search-form {
		margin-bottom: 0;
	}

	.search-input-wrapper {
		position: relative;
	}

	.search-icon {
		position: absolute;
		left: 0.875rem;
		top: 50%;
		transform: translateY(-50%);
		color: var(--text-tertiary);
		pointer-events: none;
		display: flex;
	}

	.search-input {
		padding-left: 2.75rem;
	}

	.mode-toggle {
		display: flex;
		gap: 0.5rem;
	}

	.mode-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.5rem 1rem;
		border-radius: var(--radius-full);
		font-size: 0.875rem;
		font-weight: 500;
		text-decoration: none;
		color: var(--text-secondary);
		background-color: var(--bg-tertiary);
		transition: all 0.15s ease;
	}

	.mode-btn:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
		text-decoration: none;
	}

	.mode-btn.active {
		background-color: var(--accent);
		color: var(--accent-text);
	}

	.mode-btn.active:hover {
		background-color: var(--accent-hover);
	}

	.results-header {
		display: flex;
		align-items: baseline;
		justify-content: space-between;
	}

	.results-header h2 {
		font-size: 1rem;
		font-weight: 600;
	}

	.result-count {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.results-list {
		overflow: hidden;
	}

	.result-item {
		display: flex;
		align-items: flex-start;
		gap: 0.75rem;
		padding: 0.875rem 1rem;
		text-decoration: none;
		color: var(--text-primary);
		transition: background-color 0.15s ease;
	}

	.result-item:hover {
		background-color: var(--bg-hover);
		text-decoration: none;
	}

	.result-item:not(:last-child) {
		border-bottom: 1px solid var(--border-light);
	}

	.tag-result-item {
		align-items: center;
	}

	.tag-result-icon {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 2.5rem;
		height: 2.5rem;
		border-radius: var(--radius-full);
		background-color: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
		flex-shrink: 0;
	}

	.result-info {
		display: flex;
		flex-direction: column;
		min-width: 0;
		flex: 1;
	}

	.result-name {
		font-weight: 600;
		font-size: 0.9375rem;
	}

	.result-handle {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
	}

	.result-desc {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		margin-top: 0.25rem;
		display: -webkit-box;
		-webkit-line-clamp: 2;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	.avatar-placeholder {
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 600;
		font-size: 0.875rem;
		flex-shrink: 0;
	}

	.empty-state {
		padding: 3rem 1.5rem;
		text-align: center;
		color: var(--text-secondary);
		font-size: 0.9375rem;
	}

	.hint {
		font-size: 0.8125rem;
		color: var(--text-tertiary);
		margin-top: 0.5rem;
	}
</style>

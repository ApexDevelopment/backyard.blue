<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';
	import RichTextEditor from '$lib/components/RichTextEditor.svelte';
	import TagInput from '$lib/components/TagInput.svelte';

	let text = $state('');
	let formatFacets: { index: { byteStart: number; byteEnd: number }; features: { $type: string }[] }[] = $state([]);
	let tags: string[] = $state([]);
	let submitting = $state(false);
	let error = $state('');
	const MAX_CHARS = 3000;
	let charCount = $derived(text.length);

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (!text.trim() || submitting) return;

		submitting = true;
		error = '';

		try {
			const res = await fetch('/api/post', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					text: text.trim(),
					tags: tags.length > 0 ? tags : undefined,
					formatFacets: formatFacets.length > 0 ? formatFacets : undefined
				})
			});

			if (res.ok) {
				window.location.href = '/';
			} else {
				const data = await res.json();
				error = data.error || 'failed to create post';
			}
		} catch {
			error = 'network error. please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

<svelte:head>
	<title>new post — backyard</title>
</svelte:head>

<div class="compose-page">
	<div class="compose-header">
		<a href="/" class="back-link">
			<ChevronLeft size={18} />
			back
		</a>
		<h1>new post</h1>
	</div>

	<form class="compose-form card" onsubmit={handleSubmit}>
		{#if error}
			<div class="compose-error">
				{error}
			</div>
		{/if}

		<RichTextEditor
			bind:text
			bind:facets={formatFacets}
			maxLength={MAX_CHARS}
			disabled={submitting}
		/>

		<div class="compose-tags">
			<TagInput bind:tags disabled={submitting} />
		</div>

		<div class="compose-footer">
			<span class="char-count" class:warning={charCount > MAX_CHARS * 0.9} class:over={charCount >= MAX_CHARS}>
				{charCount}/{MAX_CHARS}
			</span>
			<button type="submit" class="btn btn-primary" disabled={!text.trim() || submitting || charCount > MAX_CHARS}>
				{#if submitting}
					<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
					posting...
				{:else}
					post
				{/if}
			</button>
		</div>
	</form>
</div>

<style>
	.compose-page {
		max-width: 100%;
	}

	.compose-header {
		margin-bottom: 1rem;
	}

	.back-link {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		font-size: 0.875rem;
		color: var(--text-secondary);
		margin-bottom: 0.25rem;
	}

	.back-link:hover {
		color: var(--text-link);
	}

	.compose-header h1 {
		font-size: 1.25rem;
		font-weight: 700;
		color: var(--text-primary);
	}

	.compose-form {
		padding: 1rem;
	}

	.compose-error {
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.compose-tags {
		margin-top: 0.75rem;
	}

	.compose-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		margin-top: 0.75rem;
	}

	.char-count {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	.char-count.warning {
		color: var(--warning);
	}

	.char-count.over {
		color: var(--danger);
	}
</style>

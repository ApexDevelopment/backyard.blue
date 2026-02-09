<script lang="ts">
	import { ChevronLeft } from 'lucide-svelte';

	let text = $state('');
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
				body: JSON.stringify({ text: text.trim() })
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

		<textarea
			class="compose-textarea"
			placeholder="what's on your mind?"
			bind:value={text}
			maxlength={MAX_CHARS}
			rows="6"
			disabled={submitting}
			autofocus
		></textarea>

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

	.compose-textarea {
		width: 100%;
		padding: 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		background-color: var(--bg-primary);
		color: var(--text-primary);
		font-size: 1rem;
		line-height: 1.5;
		resize: vertical;
		min-height: 150px;
		outline: none;
		transition: border-color 0.15s ease;
	}

	.compose-textarea:focus {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-light);
	}

	.compose-textarea::placeholder {
		color: var(--text-tertiary);
	}

	.compose-textarea:disabled {
		opacity: 0.5;
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

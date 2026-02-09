<script lang="ts">
	import type { BackyardProfile, BackyardChainEntry } from '$lib/types.js';
	import { X } from 'lucide-svelte';
	import RichTextEditor from './RichTextEditor.svelte';
	import TagInput from './TagInput.svelte';

	interface Props {
		user: BackyardProfile;
		open: boolean;
		onClose: () => void;
		/** When set, the composer is in reblog mode */
		mode?: 'post' | 'reblog';
		/** In reblog mode: the subject URI to reblog */
		reblogUri?: string;
		/** In reblog mode: the subject CID */
		reblogCid?: string;
		/** In reblog mode: the chain to show as read-only context */
		reblogChain?: BackyardChainEntry[];
	}

	let {
		user,
		open = $bindable(false),
		onClose,
		mode = 'post',
		reblogUri,
		reblogCid,
		reblogChain
	}: Props = $props();

	let text = $state('');
	let formatFacets: { index: { byteStart: number; byteEnd: number }; features: { $type: string }[] }[] = $state([]);
	let tags: string[] = $state([]);
	let submitting = $state(false);
	let error = $state('');
	let charCount = $derived(text.length);
	const MAX_CHARS = 3000;

	let isReblog = $derived(mode === 'reblog');
	let title = $derived(isReblog ? 'reblog' : 'new post');
	let placeholder = $derived(isReblog ? 'add your thoughts...' : "what's on your mind?");
	let submitLabel = $derived(isReblog ? 'reblog' : 'post');

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			onClose();
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
			onClose();
		}
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (submitting) return;

		// For new posts, text is required; for reblogs, text is optional
		if (!isReblog && !text.trim()) return;

		submitting = true;
		error = '';

		try {
			const tagList = tags.length > 0 ? tags : undefined;
			const facetList = formatFacets.length > 0 ? formatFacets : undefined;

			if (isReblog) {
				// Reblog mode: call /api/repost
				const res = await fetch('/api/repost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						uri: reblogUri,
						cid: reblogCid,
						text: text.trim() || undefined,
						tags: tagList,
						formatFacets: facetList
					})
				});

				if (res.ok) {
					text = '';
					formatFacets = [];
					tags = [];
					onClose();
					window.location.reload();
				} else {
					const data = await res.json();
					error = data.error || 'failed to reblog';
				}
			} else {
				// New post mode
				const res = await fetch('/api/post', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: text.trim(),
						tags: tagList,
						formatFacets: facetList
					})
				});

				if (res.ok) {
					text = '';
					formatFacets = [];
					tags = [];
					onClose();
					window.location.reload();
				} else {
					const data = await res.json();
					error = data.error || 'failed to create post';
				}
			}
		} catch {
			error = 'network error. please try again.';
		} finally {
			submitting = false;
		}
	}
</script>

{#if open}
	<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
	<div class="modal-backdrop" role="dialog" aria-modal="true" aria-label={title} onclick={handleBackdropClick} onkeydown={handleKeydown}>
		<form class="modal-content card" onsubmit={handleSubmit}>
			<div class="modal-header">
				<h2>{title}</h2>
				<button type="button" class="modal-close" onclick={onClose} aria-label="close">
					<X size={20} />
				</button>
			</div>

			{#if error}
				<p class="composer-error">{error}</p>
			{/if}

			{#if isReblog && reblogChain && reblogChain.length > 0}
				<!-- Read-only chain preview -->
				<div class="reblog-preview">
					{#each reblogChain as entry (entry.uri)}
						<div class="preview-entry">
							<div class="preview-author">
								{#if entry.author.avatar}
									<img src={entry.author.avatar} alt="" class="avatar avatar-xs" />
								{:else}
									<div class="avatar avatar-xs avatar-placeholder">
										{(entry.author.displayName || entry.author.handle).charAt(0).toUpperCase()}
									</div>
								{/if}
								<span class="preview-author-name">{entry.author.displayName || entry.author.handle}</span>
							</div>
							{#if entry.text}
								<p class="preview-text">{entry.text}</p>
							{/if}
						</div>
					{/each}
				</div>
			{/if}

			<div class="composer-body">
				<div class="composer-avatar">
					{#if user.avatar}
						<img src={user.avatar} alt="" class="avatar" />
					{:else}
						<div class="avatar avatar-placeholder">
							{(user.displayName || user.handle).charAt(0).toUpperCase()}
						</div>
					{/if}
				</div>
				<div class="composer-fields">
					<RichTextEditor
						bind:text
						bind:facets={formatFacets}
						maxLength={MAX_CHARS}
						disabled={submitting}
						{placeholder}
					/>
					<TagInput bind:tags disabled={submitting} />
				</div>
			</div>

			<div class="composer-footer">
				<span class="char-count" class:warning={charCount > MAX_CHARS * 0.9} class:over={charCount >= MAX_CHARS}>
					{charCount}/{MAX_CHARS}
				</span>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={(!isReblog && !text.trim()) || submitting || charCount > MAX_CHARS}
				>
					{#if submitting}
						<span class="spinner" style="width:16px;height:16px;border-width:2px;"></span>
					{:else}
						{submitLabel}
					{/if}
				</button>
			</div>
		</form>
	</div>
{/if}

<style>
	.modal-backdrop {
		position: fixed;
		inset: 0;
		z-index: 200;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: flex-start;
		justify-content: center;
		padding-top: min(12vh, 100px);
		padding-left: 1rem;
		padding-right: 1rem;
		animation: fadeIn 0.15s ease;
	}

	@keyframes fadeIn {
		from { opacity: 0; }
		to { opacity: 1; }
	}

	.modal-content {
		width: 100%;
		max-width: 560px;
		max-height: 80vh;
		padding: 0;
		overflow: hidden;
		animation: slideIn 0.2s ease;
		display: flex;
		flex-direction: column;
	}

	@keyframes slideIn {
		from {
			opacity: 0;
			transform: translateY(-12px);
		}
		to {
			opacity: 1;
			transform: translateY(0);
		}
	}

	.modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.875rem 1rem;
		border-bottom: 1px solid var(--border-light);
		flex-shrink: 0;
	}

	.modal-header h2 {
		font-size: 1.0625rem;
		font-weight: 700;
	}

	.modal-close {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 32px;
		height: 32px;
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		transition: all 0.15s ease;
		cursor: pointer;
	}

	.modal-close:hover {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	/* ── Reblog preview ──────────────────────────────── */

	.reblog-preview {
		max-height: 240px;
		overflow-y: auto;
		border-bottom: 1px solid var(--border-light);
		background-color: var(--bg-secondary, var(--bg-hover));
	}

	.preview-entry {
		padding: 0.625rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}

	.preview-entry:last-child {
		border-bottom: none;
	}

	.preview-author {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		margin-bottom: 0.25rem;
	}

	.avatar-xs {
		width: 20px;
		height: 20px;
		border-radius: var(--radius-full);
		font-size: 0.625rem;
	}

	.preview-author-name {
		font-weight: 600;
		font-size: 0.8125rem;
		color: var(--text-primary);
	}

	.preview-text {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		line-height: 1.4;
		white-space: pre-wrap;
		word-wrap: break-word;
		display: -webkit-box;
		-webkit-line-clamp: 3;
		-webkit-box-orient: vertical;
		overflow: hidden;
	}

	/* ── Composer body ───────────────────────────────── */

	.composer-body {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		flex: 1;
		min-height: 0;
	}

	.composer-avatar {
		flex-shrink: 0;
	}

	.composer-fields {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0.5rem;
	}

	.composer-error {
		color: var(--danger);
		font-size: 0.8125rem;
		padding: 0.5rem 1rem 0;
	}

	.composer-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border-light);
		flex-shrink: 0;
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
</style>

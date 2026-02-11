<script lang="ts">
	import type { BackyardProfile, BackyardChainEntry } from '$lib/types.js';
	import { X, ImagePlus } from 'lucide-svelte';
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
	const MAX_IMAGES = 4;

	let isReblog = $derived(mode === 'reblog');
	let title = $derived(isReblog ? 'reblog' : 'new post');
	let placeholder = $derived(isReblog ? 'add your thoughts...' : "what's on your mind?");
	let submitLabel = $derived(isReblog ? 'reblog' : 'post');

	/* ── Image attachments ──────────────────────────── */

	interface ImageAttachment {
		file: File;
		previewUrl: string;
		alt: string;
		/** Set after successful upload to PDS */
		blob?: unknown;
		mimeType: string;
	}

	let images: ImageAttachment[] = $state([]);
	let uploading = $state(false);
	let fileInput: HTMLInputElement | undefined = $state();
	let dragging = $state(false);

	const ALLOWED_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp']);
	const MAX_FILE_SIZE = 1_000_000; // 1 MB

	function addFiles(files: FileList | File[]) {
		const remaining = MAX_IMAGES - images.length;
		if (remaining <= 0) {
			error = `maximum ${MAX_IMAGES} images allowed`;
			return;
		}

		const toAdd = Array.from(files).slice(0, remaining);
		for (const file of toAdd) {
			if (!ALLOWED_TYPES.has(file.type)) {
				error = `unsupported file type: ${file.type}. use PNG, JPEG, GIF, or WebP.`;
				return;
			}
			if (file.size > MAX_FILE_SIZE) {
				error = `"${file.name}" exceeds the 1 MB size limit.`;
				return;
			}
		}

		error = '';
		for (const file of toAdd) {
			images.push({
				file,
				previewUrl: URL.createObjectURL(file),
				alt: '',
				mimeType: file.type
			});
		}
	}

	function removeImage(index: number) {
		const removed = images.splice(index, 1);
		if (removed[0]) URL.revokeObjectURL(removed[0].previewUrl);
	}

	function handleFileSelect(e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			addFiles(input.files);
			input.value = '';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			addFiles(e.dataTransfer.files);
		}
	}

	function handleDragOver(e: DragEvent) {
		e.preventDefault();
		dragging = true;
	}

	function handleDragLeave(e: DragEvent) {
		if (!(e.currentTarget as HTMLElement).contains(e.relatedTarget as Node)) {
			dragging = false;
		}
	}

	async function uploadImages(): Promise<boolean> {
		const pending = images.filter((img) => !img.blob);
		if (pending.length === 0) return true;

		uploading = true;
		try {
			for (const img of pending) {
				const res = await fetch('/api/upload', {
					method: 'POST',
					headers: { 'Content-Type': img.mimeType },
					body: img.file
				});
				if (!res.ok) {
					const data = await res.json();
					error = data.error || 'failed to upload image';
					return false;
				}
				const { blob } = await res.json();
				img.blob = blob;
			}
			return true;
		} catch {
			error = 'network error uploading images.';
			return false;
		} finally {
			uploading = false;
		}
	}

	/* ── Lifecycle ──────────────────────────────────── */

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

	function resetState() {
		text = '';
		formatFacets = [];
		tags = [];
		for (const img of images) URL.revokeObjectURL(img.previewUrl);
		images = [];
		error = '';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (submitting || uploading) return;

		// For new posts, text or images are required; for reblogs, text is optional
		if (!isReblog && !text.trim() && images.length === 0) return;

		submitting = true;
		error = '';

		try {
			// Upload any pending images first
			if (images.length > 0) {
				const ok = await uploadImages();
				if (!ok) {
					submitting = false;
					return;
				}
			}

			const tagList = tags.length > 0 ? tags : undefined;
			const facetList = formatFacets.length > 0 ? formatFacets : undefined;

			const media = images.length > 0
				? images.map((img) => ({ blob: img.blob, mimeType: img.mimeType, alt: img.alt || undefined }))
				: undefined;

			if (isReblog) {
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
					resetState();
					onClose();
					window.location.reload();
				} else {
					const data = await res.json();
					error = data.error || 'failed to reblog';
				}
			} else {
				const res = await fetch('/api/post', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						text: text.trim(),
						tags: tagList,
						formatFacets: facetList,
						media
					})
				});

				if (res.ok) {
					resetState();
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
	<div
		class="modal-backdrop"
		class:dragging
		role="dialog"
		tabindex="-1"
		aria-modal="true"
		aria-label={title}
		onclick={handleBackdropClick}
		onkeydown={handleKeydown}
		ondrop={handleDrop}
		ondragover={handleDragOver}
		ondragleave={handleDragLeave}
	>
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
						disabled={submitting || uploading}
						{placeholder}
					/>

					{#if images.length > 0}
						<div class="image-previews">
							{#each images as img, i}
								<div class="image-preview">
									<img src={img.previewUrl} alt={img.alt || 'attachment preview'} class="preview-thumb" />
									<button
										type="button"
										class="preview-remove"
										onclick={() => removeImage(i)}
										aria-label="remove image"
										disabled={submitting || uploading}
									>
										<X size={14} />
									</button>
									<input
										type="text"
										class="preview-alt"
										placeholder="alt text"
										bind:value={img.alt}
										disabled={submitting || uploading}
									/>
								</div>
							{/each}
						</div>
					{/if}

					<TagInput bind:tags disabled={submitting || uploading} />
				</div>
			</div>

			<div class="composer-footer">
				<input
					type="file"
					accept="image/png,image/jpeg,image/gif,image/webp"
					multiple
					class="sr-only"
					bind:this={fileInput}
					onchange={handleFileSelect}
				/>
				<button
					type="button"
					class="image-btn"
					title="attach images"
					disabled={images.length >= MAX_IMAGES || submitting || uploading}
					onclick={() => fileInput?.click()}
				>
					<ImagePlus size={18} />
					{#if images.length > 0}
						<span class="image-count">{images.length}/{MAX_IMAGES}</span>
					{/if}
				</button>

				<span class="footer-spacer"></span>

				<span class="char-count" class:warning={charCount > MAX_CHARS * 0.9} class:over={charCount >= MAX_CHARS}>
					{charCount}/{MAX_CHARS}
				</span>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={(!isReblog && !text.trim() && images.length === 0) || submitting || uploading || charCount > MAX_CHARS}
				>
					{#if submitting || uploading}
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
		line-clamp: 3;
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
		gap: 0.75rem;
		padding: 0.75rem 1rem;
		border-top: 1px solid var(--border-light);
		flex-shrink: 0;
	}

	.footer-spacer {
		flex: 1;
	}

	.image-btn {
		display: flex;
		align-items: center;
		gap: 0.375rem;
		padding: 0.25rem 0.5rem;
		border-radius: var(--radius-sm, 6px);
		color: var(--text-tertiary);
		font-size: 0.75rem;
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.image-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--accent);
	}

	.image-btn:disabled {
		opacity: 0.4;
		cursor: not-allowed;
	}

	.image-count {
		color: var(--text-tertiary);
		font-variant-numeric: tabular-nums;
	}

	.sr-only {
		position: absolute;
		width: 1px;
		height: 1px;
		padding: 0;
		margin: -1px;
		overflow: hidden;
		clip: rect(0, 0, 0, 0);
		white-space: nowrap;
		border: 0;
	}

	/* ── Image previews ─────────────────────────────── */

	.image-previews {
		display: flex;
		gap: 0.5rem;
		flex-wrap: wrap;
	}

	.image-preview {
		position: relative;
		width: 96px;
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
	}

	.preview-thumb {
		width: 96px;
		height: 96px;
		object-fit: cover;
		border-radius: var(--radius-sm, 6px);
		border: 1px solid var(--border-light);
	}

	.preview-remove {
		position: absolute;
		top: 4px;
		right: 4px;
		width: 22px;
		height: 22px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background-color: rgba(0, 0, 0, 0.6);
		color: white;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.preview-remove:hover {
		background-color: rgba(0, 0, 0, 0.8);
	}

	.preview-alt {
		width: 100%;
		font-size: 0.6875rem;
		padding: 0.125rem 0.25rem;
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm, 4px);
		background: var(--bg-primary, var(--bg));
		color: var(--text-secondary);
	}

	.preview-alt::placeholder {
		color: var(--text-tertiary);
	}

	/* ── Drag-and-drop overlay ──────────────────────── */

	.modal-backdrop.dragging::after {
		content: 'drop images here';
		position: fixed;
		inset: 0;
		z-index: 210;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: rgba(0, 0, 0, 0.55);
		color: white;
		font-size: 1.125rem;
		font-weight: 600;
		pointer-events: none;
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

<script lang="ts">
	import type { BackyardProfile, BackyardChainEntry, ContentBlock } from '$lib/types.js';
	import { X, ImagePlus, Link, Type } from 'lucide-svelte';
	import RichTextEditor from './RichTextEditor.svelte';
	import RichTextRenderer from './RichTextRenderer.svelte';
	import EmbedCard from './EmbedCard.svelte';
	import TagInput from './TagInput.svelte';

	interface Props {
		user: BackyardProfile;
		open: boolean;
		onClose: () => void;
		mode?: 'post' | 'reblog' | 'edit';
		reblogUri?: string;
		reblogCid?: string;
		reblogChain?: BackyardChainEntry[];
		editSubject?: {
			uri: string;
			cid: string;
			collection: 'post' | 'reblog';
			content?: ContentBlock[];
			tags?: string[];
		};
	}

	let {
		user,
		open = $bindable(false),
		onClose,
		mode = 'post',
		reblogUri,
		reblogCid,
		reblogChain,
		editSubject
	}: Props = $props();

	/* ── Block types ──────────────────────────────────── */

	interface TextBlock {
		id: number;
		type: 'text';
		text: string;
		formatFacets: { index: { byteStart: number; byteEnd: number }; features: { $type: string }[] }[];
	}

	interface ImageBlock {
		id: number;
		type: 'image';
		file: File | null;
		previewUrl: string;
		alt: string;
		blob?: unknown;
		mimeType: string;
	}

	interface EmbedBlock {
		id: number;
		type: 'embed';
		url: string;
	}

	type EditorBlock = TextBlock | ImageBlock | EmbedBlock;

	let nextBlockId = 1;
	function makeTextBlock(text = '', formatFacets: TextBlock['formatFacets'] = []): TextBlock {
		return { id: nextBlockId++, type: 'text', text, formatFacets };
	}
	function makeImageBlock(file: File | null, previewUrl: string, mimeType: string, alt = '', blob?: unknown): ImageBlock {
		return { id: nextBlockId++, type: 'image', file, previewUrl, alt, blob, mimeType };
	}
	function makeEmbedBlock(url = ''): EmbedBlock {
		return { id: nextBlockId++, type: 'embed', url };
	}

	/* ── State ────────────────────────────────────────── */

	let blocks: EditorBlock[] = $state([makeTextBlock()]);
	let tags: string[] = $state([]);
	let submitting = $state(false);
	let uploading = $state(false);
	let error = $state('');
	let dragging = $state(false);
	let confirmCloseOpen = $state(false);
	let altEditBlockId: number | null = $state(null);
	let altEditValue = $state('');
	let altTextarea: HTMLTextAreaElement | undefined = $state();

	const MAX_CHARS = 3000;
	const MAX_BLOCKS = 20;

	const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif']);
	const VIDEO_TYPES = new Set(['video/mp4', 'video/webm']);
	const ALLOWED_TYPES = new Set([...IMAGE_TYPES, ...VIDEO_TYPES]);
	const MAX_IMAGE_SIZE = 10_000_000;
	const MAX_VIDEO_SIZE = 50_000_000;

	let isReblog = $derived(mode === 'reblog');
	let isEdit = $derived(mode === 'edit');
	let title = $derived(isEdit ? 'edit' : isReblog ? 'reblog' : 'new post');
	let submitLabel = $derived(isEdit ? 'save' : isReblog ? 'reblog' : 'post');

	let imageBlockCount = $derived(blocks.filter((b) => b.type === 'image').length);
	let totalCharCount = $derived(
		blocks.reduce((sum, b) => sum + (b.type === 'text' ? b.text.length : 0), 0)
	);
	let hasContent = $derived(
		blocks.some((b) =>
			(b.type === 'text' && b.text.trim().length > 0) ||
			b.type === 'image' ||
			(b.type === 'embed' && b.url.trim().length > 0)
		)
	);
	let anyTextOverLimit = $derived(
		blocks.some((b) => b.type === 'text' && b.text.length > MAX_CHARS)
	);

	function isVideo(mimeType: string): boolean {
		return VIDEO_TYPES.has(mimeType);
	}

	/* ── Lifecycle / pre-fill ─────────────────────────── */

	let wasOpen = false;
	$effect(() => {
		const justOpened = open && !wasOpen;
		wasOpen = open;

		if (justOpened && isEdit && editSubject) {
			tags = editSubject.tags ? [...editSubject.tags] : [];
			error = '';

			if (editSubject.content && editSubject.content.length > 0) {
				blocks = editSubject.content.map((block) => {
					if (block.type === 'text') {
						return makeTextBlock(block.text, block.facets ? block.facets.map((f: any) => ({ index: f.index, features: f.features })) : []);
					} else if (block.type === 'image') {
						return makeImageBlock(null, block.image.url, block.image.mimeType, block.image.alt || '', block.image);
					} else if (block.type === 'embed') {
						return makeEmbedBlock(block.url);
					}
					return makeTextBlock();
				});
			} else {
				blocks = [makeTextBlock()];
			}
		} else if (justOpened && !isEdit) {
			blocks = [makeTextBlock()];
			tags = [];
			error = '';
		}
	});

	/* ── Block manipulation ───────────────────────────── */

	function insertBlockAfter(afterId: number, block: EditorBlock) {
		if (blocks.length >= MAX_BLOCKS) {
			error = `maximum ${MAX_BLOCKS} content blocks`;
			return;
		}
		const idx = blocks.findIndex((b) => b.id === afterId);
		blocks.splice(idx + 1, 0, block);
		blocks = blocks;
	}

	function removeBlock(id: number) {
		const idx = blocks.findIndex((b) => b.id === id);
		if (idx === -1) return;
		const block = blocks[idx];
		if (block.type === 'image' && block.previewUrl && block.file) {
			URL.revokeObjectURL(block.previewUrl);
		}
		blocks.splice(idx, 1);
		// Collapse empty text blocks that were adjacent to the removed block
		if (idx < blocks.length && blocks[idx].type === 'text' && !blocks[idx].text.trim()) {
			blocks.splice(idx, 1);
		}
		if (idx > 0 && blocks[idx - 1]?.type === 'text' && !(blocks[idx - 1] as TextBlock).text.trim()) {
			blocks.splice(idx - 1, 1);
		}
		if (blocks.length === 0) blocks.push(makeTextBlock());
		blocks = blocks;
	}

	function addImageBlock(afterId: number, file: File) {
		const limit = isVideo(file.type) ? MAX_VIDEO_SIZE : MAX_IMAGE_SIZE;
		if (!ALLOWED_TYPES.has(file.type)) {
			error = `unsupported file type: ${file.type}`;
			return;
		}
		if (file.size > limit) {
			error = `file exceeds the ${file.size >= 1_000_000 ? `${limit / 1_000_000} MB` : `${limit / 1_000} KB`} size limit`;
			return;
		}
		error = '';
		const imgBlock = makeImageBlock(file, URL.createObjectURL(file), file.type);
		insertBlockAfter(afterId, imgBlock);
	}

	function addEmbedBlock(afterId: number) {
		const embedBlock = makeEmbedBlock();
		insertBlockAfter(afterId, embedBlock);
	}

	/* ── File handling ────────────────────────────────── */

	function handleInlineFileSelect(afterId: number, e: Event) {
		const input = e.target as HTMLInputElement;
		if (input.files && input.files.length > 0) {
			for (const file of Array.from(input.files)) {
				addImageBlock(afterId, file);
				afterId = blocks[blocks.findIndex((b) => b.id === afterId) + 1]?.id || blocks[blocks.length - 1].id;
			}
			input.value = '';
		}
	}

	function handleDrop(e: DragEvent) {
		e.preventDefault();
		dragging = false;
		if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
			for (const file of Array.from(e.dataTransfer.files)) {
				const insertAfter = blocks[blocks.length - 1].id;
				addImageBlock(insertAfter, file);
			}
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

	/* ── Alt text editing ─────────────────────────────── */

	function openAltEditor(blockId: number) {
		const block = blocks.find((b) => b.id === blockId);
		if (!block || block.type !== 'image') return;
		altEditBlockId = blockId;
		altEditValue = block.alt;
		requestAnimationFrame(() => altTextarea?.focus());
	}

	function saveAlt() {
		if (altEditBlockId !== null) {
			const block = blocks.find((b) => b.id === altEditBlockId);
			if (block && block.type === 'image') {
				block.alt = altEditValue;
				blocks = blocks;
			}
		}
		altEditBlockId = null;
	}

	function cancelAlt() {
		altEditBlockId = null;
	}

	let altEditBlock = $derived(altEditBlockId !== null ? blocks.find((b) => b.id === altEditBlockId && b.type === 'image') as ImageBlock | undefined : undefined);

	/* ── Upload & Submit ──────────────────────────────── */

	async function uploadImages(): Promise<boolean> {
		const pending = blocks.filter((b): b is ImageBlock => b.type === 'image' && !b.blob);
		if (pending.length === 0) return true;

		uploading = true;
		try {
			for (const img of pending) {
				if (!img.file) continue;
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

	function buildContentPayload(): any[] {
		const content: any[] = [];
		for (const block of blocks) {
			if (block.type === 'text') {
				if (!block.text.trim()) continue;
				content.push({
					type: 'text',
					text: block.text.trim(),
					formatFacets: block.formatFacets.length > 0 ? block.formatFacets : undefined
				});
			} else if (block.type === 'image') {
				content.push({
					type: 'image',
					blob: block.blob,
					mimeType: block.mimeType,
					alt: block.alt || undefined
				});
			} else if (block.type === 'embed') {
				if (!block.url.trim()) continue;
				content.push({ type: 'embed', url: block.url.trim() });
			}
		}
		return content;
	}

	function requestClose() {
		if (hasContent || tags.length > 0) {
			confirmCloseOpen = true;
		} else {
			onClose();
		}
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Escape') {
			if (altEditBlockId !== null) {
				cancelAlt();
			} else if (confirmCloseOpen) {
				confirmCloseOpen = false;
			} else {
				requestClose();
			}
		}
	}

	function handleBackdropClick(e: MouseEvent) {
		if ((e.target as HTMLElement).classList.contains('modal-backdrop')) {
			requestClose();
		}
	}

	function resetState() {
		for (const b of blocks) {
			if (b.type === 'image' && b.previewUrl && b.file) URL.revokeObjectURL(b.previewUrl);
		}
		blocks = [makeTextBlock()];
		tags = [];
		error = '';
	}

	async function handleSubmit(e: Event) {
		e.preventDefault();
		if (submitting || uploading) return;

		if (!isReblog && !isEdit && !hasContent) return;
		if (isEdit && editSubject?.collection === 'post' && !hasContent) return;

		submitting = true;
		error = '';

		try {
			const ok = await uploadImages();
			if (!ok) { submitting = false; return; }

			const content = buildContentPayload();
			const tagList = tags.length > 0 ? tags : undefined;

			if (isEdit && editSubject) {
				const endpoint = editSubject.collection === 'post' ? '/api/post' : '/api/repost';
				const body: Record<string, unknown> = {
					uri: editSubject.uri,
					content: content.length > 0 ? content : undefined,
					tags: tagList
				};

				const res = await fetch(endpoint, {
					method: 'PUT',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(body)
				});

				if (res.ok) {
					resetState();
					onClose();
					window.location.reload();
				} else {
					const data = await res.json();
					error = data.error || 'failed to save edit';
				}
			} else if (isReblog) {
				const res = await fetch('/api/repost', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify({
						uri: reblogUri,
						cid: reblogCid,
						content: content.length > 0 ? content : undefined,
						tags: tagList
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
					body: JSON.stringify({ content, tags: tagList })
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
				<button type="button" class="modal-close" onclick={requestClose} aria-label="close">
					<X size={20} />
				</button>
			</div>

			{#if error}
				<p class="composer-error">{error}</p>
			{/if}

			{#if user.mediaTrusted === false}
				<p class="composer-trust-notice">your account is still being verified &mdash; any images you upload will be temporarily hidden from other users. this happens automatically and no action is needed on your part.</p>
			{/if}

			{#if isReblog && reblogChain && reblogChain.length > 0}
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
							{#if entry.content && entry.content.length > 0}
								{#each entry.content as block}
									{#if block.type === 'text' && block.text}
										<p class="preview-text"><RichTextRenderer text={block.text} facets={block.facets} /></p>
									{:else if block.type === 'image'}
										<div class="preview-media">
											{#if entry.author.mediaTrusted !== false}
												{#if block.image.mimeType?.startsWith('video/')}
													<!-- svelte-ignore a11y_media_has_caption -->
													<video src={block.image.url} class="preview-image" muted loop playsinline preload="metadata"></video>
												{:else}
													<img src={block.image.url} alt={block.image.alt || ''} class="preview-image" loading="lazy" />
												{/if}
											{:else}
												<p class="preview-text">[media hidden]</p>
											{/if}
										</div>
									{:else if block.type === 'embed'}
										<div class="preview-embed">
											<EmbedCard url={block.url} />
										</div>
									{/if}
								{/each}
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
					{#each blocks as block, i (block.id)}
						<div class="block-wrapper">
						{#if block.type === 'text'}
							<RichTextEditor
								bind:text={block.text}
								bind:facets={block.formatFacets}
								maxLength={MAX_CHARS}
								disabled={submitting || uploading}
								placeholder={i === 0 ? (isEdit ? 'edit your post…' : isReblog ? 'add your thoughts...' : "what's on your mind?") : 'continue writing…'}
							/>
						{:else if block.type === 'image'}
							<div class="block-image-preview">
								<button
									type="button"
									class="preview-thumb-btn"
									onclick={() => openAltEditor(block.id)}
									title="edit alt text"
									disabled={submitting || uploading}
								>
									{#if isVideo(block.mimeType)}
										<!-- svelte-ignore a11y_media_has_caption -->
										<video src={block.previewUrl} class="block-image-thumb" muted loop playsinline></video>
									{:else}
										<img src={block.previewUrl} alt={block.alt || 'attachment preview'} class="block-image-thumb" />
									{/if}
									<span class="alt-badge" class:alt-set={block.alt.length > 0}>ALT</span>
								</button>
								<button
									type="button"
									class="block-remove"
									onclick={() => removeBlock(block.id)}
									aria-label="remove image"
									disabled={submitting || uploading}
								>
									<X size={14} />
								</button>
							</div>
						{:else if block.type === 'embed'}
							<div class="block-embed">
								<Link size={16} />
								<input
									type="url"
									class="embed-url-input"
									placeholder="paste a URL…"
									bind:value={block.url}
									disabled={submitting || uploading}
								/>
								<button
									type="button"
									class="block-remove-inline"
									onclick={() => removeBlock(block.id)}
									aria-label="remove embed"
									disabled={submitting || uploading}
								>
									<X size={14} />
								</button>
							</div>
						{/if}

						{#if blocks.length < MAX_BLOCKS}
							<div class="block-insert-controls">
								<input
									type="file"
									accept="image/png,image/jpeg,image/gif,image/webp,image/avif,video/mp4,video/webm"
									multiple
									class="sr-only"
									id="file-insert-{block.id}"
									onchange={(e) => handleInlineFileSelect(block.id, e)}
								/>
								<button type="button" class="block-insert-btn" title="add image" onclick={() => document.getElementById(`file-insert-${block.id}`)?.click()} disabled={submitting || uploading}>
									<ImagePlus size={14} />
								</button>
								<button type="button" class="block-insert-btn" title="add embed" onclick={() => addEmbedBlock(block.id)} disabled={submitting || uploading}>
									<Link size={14} />
								</button>
								{#if block.type === 'image' || block.type === 'embed'}
									<button type="button" class="block-insert-btn" title="add text" onclick={() => insertBlockAfter(block.id, makeTextBlock())} disabled={submitting || uploading}>
										<Type size={14} />
									</button>
								{/if}
							</div>
						{/if}
						</div>
					{/each}
				</div>
			</div>

			<div class="composer-footer">
				<div class="footer-tags">
					<TagInput bind:tags disabled={submitting || uploading} />
				</div>

				<span class="char-count" class:warning={totalCharCount > MAX_CHARS * 0.9} class:over={anyTextOverLimit}>
					{totalCharCount}
				</span>
				<button
					type="submit"
					class="btn btn-primary"
					disabled={(!isReblog && !hasContent) || submitting || uploading || anyTextOverLimit}
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

	{#if altEditBlock}
		<!-- svelte-ignore a11y_no_noninteractive_element_interactions -->
		<div
			class="alt-backdrop"
			role="dialog"
			tabindex="-1"
			aria-modal="true"
			aria-label="edit alt text"
			onclick={(e) => { if ((e.target as HTMLElement).classList.contains('alt-backdrop')) cancelAlt(); }}
			onkeydown={(e) => { if (e.key === 'Escape') cancelAlt(); }}
		>
			<div class="alt-modal card">
				<div class="alt-modal-header">
					<h3>edit alt text</h3>
					<button type="button" class="modal-close" onclick={cancelAlt} aria-label="close">
						<X size={20} />
					</button>
				</div>
				<div class="alt-modal-body">
					<div class="alt-preview-large">
						{#if isVideo(altEditBlock.mimeType)}
							<!-- svelte-ignore a11y_media_has_caption -->
							<video src={altEditBlock.previewUrl} class="alt-preview-media" muted loop playsinline controls></video>
						{:else}
							<img src={altEditBlock.previewUrl} alt="" class="alt-preview-media" />
						{/if}
					</div>
					<textarea
						class="alt-textarea"
						placeholder="describe this media for people who use screen readers…"
						bind:value={altEditValue}
						bind:this={altTextarea}
						maxlength="1000"
					></textarea>
					<div class="alt-modal-footer">
						<span class="alt-char-count">{altEditValue.length}/1000</span>
						<button type="button" class="btn btn-primary" onclick={saveAlt}>save</button>
					</div>
				</div>
			</div>
		</div>
	{/if}

	{#if confirmCloseOpen}
		<div
			class="confirm-backdrop"
			role="dialog"
			aria-modal="true"
			aria-label="discard post"
			tabindex="-1"
		>
			<div class="confirm-dialog card">
				<p class="confirm-message">discard this post? your changes will be lost.</p>
				<div class="confirm-actions">
					<button type="button" class="btn btn-ghost" onclick={() => (confirmCloseOpen = false)}>cancel</button>
					<button type="button" class="btn btn-danger" onclick={() => { confirmCloseOpen = false; resetState(); onClose(); }}>discard</button>
				</div>
			</div>
		</div>
	{/if}
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
		padding-top: min(10vh, 80px);
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
		max-width: 680px;
		max-height: 82vh;
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
	}

	.preview-media {
		margin-top: 0.25rem;
	}

	.preview-image {
		max-width: 100%;
		max-height: 200px;
		object-fit: contain;
		border-radius: var(--radius-sm, 6px);
		display: block;
	}

	.preview-embed {
		margin-top: 0.25rem;
		font-size: 0.8125rem;
	}

	/* ── Composer body ───────────────────────────────── */

	.composer-body {
		display: flex;
		gap: 0.75rem;
		padding: 1rem;
		flex: 1;
		min-height: 0;
		overflow-y: auto;
	}

	.composer-avatar {
		flex-shrink: 0;
	}

	.composer-fields {
		flex: 1;
		min-width: 0;
		display: flex;
		flex-direction: column;
		gap: 0;
	}

	.composer-error {
		color: var(--danger);
		font-size: 0.8125rem;
		padding: 0.5rem 1rem 0;
	}

	.composer-trust-notice {
		font-size: 0.8125rem;
		color: var(--text-secondary);
		background-color: color-mix(in srgb, var(--accent) 8%, transparent);
		border-left: 3px solid var(--accent);
		padding: 0.5rem 1rem;
		margin: 0.5rem 1rem 0;
		line-height: 1.45;
		border-radius: 0 var(--radius-sm, 4px) var(--radius-sm, 4px) 0;
	}

	.composer-footer {
		display: flex;
		align-items: center;
		gap: 0.75rem;
		padding: 0.5rem 1rem;
		border-top: 1px solid var(--border-light);
		flex-shrink: 0;
	}

	.footer-tags {
		flex: 1;
		min-width: 0;
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

	/* ── Block image preview ────────────────────────── */

	.block-image-preview {
		position: relative;
		max-width: 100%;
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
		border: 1px solid var(--border-light);
	}

	.preview-thumb-btn {
		position: relative;
		display: block;
		width: 100%;
		padding: 0;
		border: none;
		background: var(--bg-secondary, var(--bg-hover));
		cursor: pointer;
	}

	.block-image-thumb {
		width: 100%;
		object-fit: contain;
		display: block;
	}

	.preview-thumb-btn:hover .block-image-thumb,
	.preview-thumb-btn:focus-visible .block-image-thumb {
		filter: brightness(0.9);
	}

	.alt-badge {
		position: absolute;
		bottom: 6px;
		left: 6px;
		padding: 1px 5px;
		font-size: 0.625rem;
		font-weight: 700;
		line-height: 1.4;
		border-radius: 4px;
		background-color: rgba(0, 0, 0, 0.55);
		color: rgba(255, 255, 255, 0.75);
		pointer-events: none;
		text-transform: uppercase;
		letter-spacing: 0.02em;
	}

	.alt-badge.alt-set {
		background-color: var(--accent);
		color: white;
	}

	.block-remove {
		position: absolute;
		top: 6px;
		right: 6px;
		width: 24px;
		height: 24px;
		display: flex;
		align-items: center;
		justify-content: center;
		border-radius: var(--radius-full);
		background-color: rgba(0, 0, 0, 0.6);
		color: white;
		cursor: pointer;
		transition: background-color 0.15s ease;
	}

	.block-remove:hover {
		background-color: rgba(0, 0, 0, 0.8);
	}

	/* ── Block embed ────────────────────────────────── */

	.block-embed {
		display: flex;
		align-items: center;
		gap: 0.5rem;
		padding: 0.375rem 0.625rem;
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm, 6px);
		background: var(--bg-secondary, var(--bg-hover));
		color: var(--text-tertiary);
	}

	.embed-url-input {
		flex: 1;
		min-width: 0;
		border: none;
		background: transparent;
		font-size: 0.875rem;
		color: var(--text-primary);
		font-family: inherit;
		outline: none;
	}

	.embed-url-input::placeholder {
		color: var(--text-tertiary);
	}

	.block-remove-inline {
		flex-shrink: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		width: 22px;
		height: 22px;
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.block-remove-inline:hover {
		background-color: var(--bg-hover);
		color: var(--danger);
	}

	/* ── Block insert controls ──────────────────────── */

	.block-wrapper {
		position: relative;
	}

	.block-wrapper:not(:first-child) {
		margin-top: -1px;
	}

	.block-wrapper:not(:first-child) > .block-image-preview,
	.block-wrapper:not(:first-child) > .block-embed,
	.block-wrapper:not(:first-child) > :global(.rte-container) {
		border-top-left-radius: 0;
		border-top-right-radius: 0;
	}

	.block-wrapper:not(:last-child) > .block-image-preview,
	.block-wrapper:not(:last-child) > .block-embed,
	.block-wrapper:not(:last-child) > :global(.rte-container) {
		border-bottom-left-radius: 0;
		border-bottom-right-radius: 0;
	}

	.block-insert-controls {
		position: absolute;
		bottom: 0;
		left: 50%;
		transform: translate(-50%, 50%);
		z-index: 5;
		display: flex;
		align-items: center;
		gap: 0.25rem;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.block-wrapper:hover > .block-insert-controls,
	.block-insert-controls:focus-within {
		opacity: 1;
	}

	.block-insert-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 24px;
		height: 24px;
		border-radius: var(--radius-full);
		color: var(--text-tertiary);
		background-color: var(--bg-primary, var(--bg));
		box-shadow: 0 0 0 1px var(--border-light);
		cursor: pointer;
		transition: all 0.15s ease;
	}

	.block-insert-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--accent);
	}

	.block-insert-btn:disabled {
		opacity: 0.3;
		cursor: not-allowed;
	}

	/* ── Alt text modal ─────────────────────────────── */

	.alt-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300;
		background-color: rgba(0, 0, 0, 0.6);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
		animation: fadeIn 0.15s ease;
	}

	.alt-modal {
		width: 100%;
		max-width: 480px;
		padding: 0;
		overflow: hidden;
		animation: slideIn 0.2s ease;
	}

	.alt-modal-header {
		display: flex;
		align-items: center;
		justify-content: space-between;
		padding: 0.75rem 1rem;
		border-bottom: 1px solid var(--border-light);
	}

	.alt-modal-header h3 {
		font-size: 1rem;
		font-weight: 700;
	}

	.alt-modal-body {
		padding: 1rem;
		display: flex;
		flex-direction: column;
		gap: 0.75rem;
	}

	.alt-preview-large {
		display: flex;
		justify-content: center;
		background-color: var(--bg-secondary, var(--bg-hover));
		border-radius: var(--radius-sm, 6px);
		overflow: hidden;
	}

	.alt-preview-media {
		max-width: 100%;
		max-height: 240px;
		object-fit: contain;
	}

	.alt-textarea {
		width: 100%;
		min-height: 80px;
		padding: 0.625rem;
		font-size: 0.875rem;
		line-height: 1.5;
		border: 1px solid var(--border-light);
		border-radius: var(--radius-sm, 6px);
		background: var(--bg-primary, var(--bg));
		color: var(--text-primary);
		resize: vertical;
		font-family: inherit;
	}

	.alt-textarea::placeholder {
		color: var(--text-tertiary);
	}

	.alt-textarea:focus {
		outline: none;
		border-color: var(--accent);
	}

	.alt-modal-footer {
		display: flex;
		align-items: center;
		justify-content: flex-end;
		gap: 0.75rem;
	}

	.alt-char-count {
		font-size: 0.75rem;
		color: var(--text-tertiary);
	}

	/* ── Drag-and-drop overlay ──────────────────────── */

	.modal-backdrop.dragging::after {
		content: 'drop media here';
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

	.confirm-backdrop {
		position: fixed;
		inset: 0;
		z-index: 300;
		background-color: rgba(0, 0, 0, 0.5);
		display: flex;
		align-items: center;
		justify-content: center;
		padding: 1rem;
	}

	.confirm-dialog {
		width: 100%;
		max-width: 360px;
		padding: 1.25rem;
	}

	.confirm-message {
		font-size: 0.9375rem;
		line-height: 1.5;
		margin-bottom: 1rem;
	}

	.confirm-actions {
		display: flex;
		justify-content: flex-end;
		gap: 0.5rem;
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

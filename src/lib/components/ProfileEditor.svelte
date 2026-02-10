<script lang="ts">
	import { goto } from '$app/navigation';
	import { Camera, X, Save, LogOut, ArrowLeft } from 'lucide-svelte';

	interface Props {
		/** 'create' = mandatory first-time creation; 'edit' = voluntary update */
		mode: 'create' | 'edit';
		/** User's handle — used for redirect after save / cancel in edit mode */
		handle: string;
		/** Existing profile data for pre-population in edit mode */
		initialData?: {
			displayName?: string;
			pronouns?: string;
			description?: string;
			avatar?: string;
			banner?: string;
		};
	}

	let { mode, handle, initialData }: Props = $props();

	// ── Form state ──────────────────────────────────────────────────────
	let displayName = $state(initialData?.displayName || '');
	let pronouns = $state(initialData?.pronouns || '');
	let description = $state(initialData?.description || '');

	// Image state: preview URL + selected file + action for the API
	let avatarPreview = $state<string | null>(initialData?.avatar || null);
	let bannerPreview = $state<string | null>(initialData?.banner || null);
	let avatarFile = $state<File | null>(null);
	let bannerFile = $state<File | null>(null);
	let avatarAction = $state<'keep' | 'upload' | 'remove'>(initialData?.avatar ? 'keep' : 'remove');
	let bannerAction = $state<'keep' | 'upload' | 'remove'>(initialData?.banner ? 'keep' : 'remove');

	let saving = $state(false);
	let errorMsg = $state('');

	// Hidden file input refs
	let avatarInput: HTMLInputElement | undefined = $state();
	let bannerInput: HTMLInputElement | undefined = $state();

	// ── Image handlers ──────────────────────────────────────────────────
	function handleImageSelect(
		e: Event,
		type: 'avatar' | 'banner'
	) {
		const input = e.target as HTMLInputElement;
		const file = input.files?.[0];
		if (!file) return;

		if (!['image/png', 'image/jpeg'].includes(file.type)) {
			errorMsg = `${type} must be a PNG or JPEG image.`;
			return;
		}
		if (file.size > 1_000_000) {
			errorMsg = `${type} must be under 1 MB.`;
			return;
		}

		errorMsg = '';
		const url = URL.createObjectURL(file);

		if (type === 'avatar') {
			if (avatarPreview && avatarFile) URL.revokeObjectURL(avatarPreview);
			avatarPreview = url;
			avatarFile = file;
			avatarAction = 'upload';
		} else {
			if (bannerPreview && bannerFile) URL.revokeObjectURL(bannerPreview);
			bannerPreview = url;
			bannerFile = file;
			bannerAction = 'upload';
		}
	}

	function removeImage(type: 'avatar' | 'banner') {
		if (type === 'avatar') {
			if (avatarPreview && avatarFile) URL.revokeObjectURL(avatarPreview);
			avatarPreview = null;
			avatarFile = null;
			avatarAction = 'remove';
		} else {
			if (bannerPreview && bannerFile) URL.revokeObjectURL(bannerPreview);
			bannerPreview = null;
			bannerFile = null;
			bannerAction = 'remove';
		}
	}

	/** Read a File as a base64 data-URL string. */
	function fileToBase64(file: File): Promise<string> {
		return new Promise((resolve, reject) => {
			const reader = new FileReader();
			reader.onload = () => resolve(reader.result as string);
			reader.onerror = reject;
			reader.readAsDataURL(file);
		});
	}

	// ── Save ────────────────────────────────────────────────────────────
	async function save() {
		if (saving) return;

		saving = true;
		errorMsg = '';

		try {
			const body: Record<string, string | null> = {
				displayName: displayName.trim(),
				pronouns: pronouns.trim(),
				description: description.trim(),
				avatarAction,
				bannerAction,
				avatar: null,
				banner: null
			};

			if (avatarFile) body.avatar = await fileToBase64(avatarFile);
			if (bannerFile) body.banner = await fileToBase64(bannerFile);

			const res = await fetch('/api/profile', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify(body)
			});

			if (res.ok) {
				goto(mode === 'create' ? '/' : `/profile/${handle}`);
			} else {
				let msg = 'something went wrong. please try again.';
				try {
					const data = await res.json();
					if (data.error) msg = data.error;
				} catch {
					// Response body was not JSON
				}
				errorMsg = msg;
			}
		} catch {
			errorMsg = 'network error. please try again.';
		} finally {
			saving = false;
		}
	}

	// ── Cancel ──────────────────────────────────────────────────────────
	function cancel() {
		if (mode === 'create') {
			// Mandatory creation — cancelling signs the user out
			goto('/logout');
		} else {
			goto(`/profile/${handle}`);
		}
	}
</script>

<!-- Hidden file inputs -->
<input
	bind:this={avatarInput}
	type="file"
	accept="image/png,image/jpeg"
	class="sr-only"
	onchange={(e) => handleImageSelect(e, 'avatar')}
/>
<input
	bind:this={bannerInput}
	type="file"
	accept="image/png,image/jpeg"
	class="sr-only"
	onchange={(e) => handleImageSelect(e, 'banner')}
/>

<div class="profile-editor card">
	<!-- Banner area -->
	<div class="editor-banner-area">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="editor-banner" onclick={() => bannerInput?.click()}>
			{#if bannerPreview}
				<img src={bannerPreview} alt="" class="banner-img" />
			{:else}
				<div class="banner-placeholder"></div>
			{/if}
			<div class="image-overlay">
				<Camera size={20} />
				<span>{bannerPreview ? 'change' : 'upload'} banner</span>
			</div>
		</div>
		{#if bannerPreview}
			<button
				type="button"
				class="remove-image-btn remove-banner-btn"
				onclick={() => removeImage('banner')}
				aria-label="remove banner"
			>
				<X size={14} />
			</button>
		{/if}
	</div>

	<!-- Avatar area -->
	<div class="editor-avatar-area">
		<!-- svelte-ignore a11y_click_events_have_key_events -->
		<!-- svelte-ignore a11y_no_static_element_interactions -->
		<div class="editor-avatar" onclick={() => avatarInput?.click()}>
			{#if avatarPreview}
				<img src={avatarPreview} alt="" class="avatar-img" />
			{:else}
				<div class="avatar-placeholder-circle">
					{(displayName || handle || '?').charAt(0).toUpperCase()}
				</div>
			{/if}
			<div class="image-overlay round">
				<Camera size={16} />
			</div>
		</div>
		{#if avatarPreview}
			<button
				type="button"
				class="remove-image-btn remove-avatar-btn"
				onclick={() => removeImage('avatar')}
				aria-label="remove avatar"
			>
				<X size={12} />
			</button>
		{/if}
	</div>

	<!-- Form -->
	<div class="editor-form">
		{#if errorMsg}
			<div class="error-msg">{errorMsg}</div>
		{/if}

		<label class="field">
			<span class="field-label">display name <span class="required">*</span></span>
			<input
				type="text"
				bind:value={displayName}
				maxlength={640}
				placeholder="your name"
				class="field-input"
			/>
		</label>

		<label class="field">
			<span class="field-label">pronouns</span>
			<input
				type="text"
				bind:value={pronouns}
				maxlength={640}
				placeholder="e.g. they/them"
				class="field-input"
			/>
		</label>

		<label class="field">
			<span class="field-label">bio</span>
			<textarea
				bind:value={description}
				maxlength={2560}
				rows={4}
				placeholder="tell people about yourself"
				class="field-input field-textarea"
			></textarea>
			<span class="field-hint">{description.length} / 2560</span>
		</label>

		<div class="editor-actions">
			<button type="button" class="btn btn-secondary" onclick={cancel} disabled={saving}>
				{#if mode === 'create'}
					<LogOut size={16} />
					sign out
				{:else}
					<ArrowLeft size={16} />
					cancel
				{/if}
			</button>
			<button type="button" class="btn btn-primary" onclick={save} disabled={saving}>
				<Save size={16} />
				{saving ? 'saving…' : 'save profile'}
			</button>
		</div>
	</div>
</div>

<style>
	.profile-editor {
		width: 100%;
		max-width: 520px;
		overflow: hidden;
	}

	/* ── Banner ────────────────────────────────────────────────────── */
	.editor-banner-area {
		position: relative;
	}

	.editor-banner {
		position: relative;
		height: 150px;
		cursor: pointer;
		overflow: hidden;
	}

	.banner-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.banner-placeholder {
		width: 100%;
		height: 100%;
		background: linear-gradient(135deg, var(--accent) 0%, var(--accent-hover) 100%);
	}

	.image-overlay {
		position: absolute;
		inset: 0;
		display: flex;
		align-items: center;
		justify-content: center;
		gap: 0.375rem;
		background-color: rgba(0, 0, 0, 0.35);
		color: white;
		font-size: 0.8125rem;
		font-weight: 500;
		opacity: 0;
		transition: opacity 0.15s ease;
	}

	.editor-banner:hover .image-overlay,
	.editor-avatar:hover .image-overlay {
		opacity: 1;
	}

	.remove-image-btn {
		position: absolute;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--danger);
		color: white;
		border: 2px solid var(--bg-card);
		cursor: pointer;
		transition: background-color 0.15s ease;
		z-index: 2;
	}

	.remove-image-btn:hover {
		background-color: var(--danger-hover);
	}

	.remove-banner-btn {
		top: 0.5rem;
		right: 0.5rem;
		width: 1.5rem;
		height: 1.5rem;
		border-radius: var(--radius-sm);
	}

	/* ── Avatar ────────────────────────────────────────────────────── */
	.editor-avatar-area {
		position: relative;
		width: fit-content;
		margin-top: -2.25rem;
		margin-left: 1rem;
	}

	.editor-avatar {
		position: relative;
		width: 4.5rem;
		height: 4.5rem;
		border-radius: var(--radius-full);
		border: 3px solid var(--bg-card);
		cursor: pointer;
		overflow: hidden;
	}

	.avatar-img {
		width: 100%;
		height: 100%;
		object-fit: cover;
	}

	.avatar-placeholder-circle {
		width: 100%;
		height: 100%;
		display: flex;
		align-items: center;
		justify-content: center;
		background-color: var(--accent);
		color: white;
		font-weight: 700;
		font-size: 1.5rem;
	}

	.image-overlay.round {
		border-radius: var(--radius-full);
	}

	.remove-avatar-btn {
		top: -0.125rem;
		right: -0.125rem;
		width: 1.25rem;
		height: 1.25rem;
		border-radius: var(--radius-full);
	}

	/* ── Form ──────────────────────────────────────────────────────── */
	.editor-form {
		padding: 1rem 1.25rem 1.25rem;
	}

	.error-msg {
		padding: 0.75rem;
		background-color: color-mix(in srgb, var(--danger) 10%, transparent);
		color: var(--danger);
		border-radius: var(--radius-sm);
		font-size: 0.875rem;
		margin-bottom: 1rem;
	}

	.field {
		display: flex;
		flex-direction: column;
		gap: 0.25rem;
		margin-bottom: 1rem;
	}

	.field-label {
		font-size: 0.8125rem;
		font-weight: 600;
		color: var(--text-secondary);
	}

	.required {
		color: var(--danger);
	}

	.field-input {
		padding: 0.5rem 0.75rem;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		background-color: var(--bg-primary);
		color: var(--text-primary);
		font-size: 0.9375rem;
		font-family: inherit;
		transition: border-color 0.15s ease;
	}

	.field-input:focus {
		outline: none;
		border-color: var(--accent);
	}

	.field-textarea {
		resize: vertical;
		min-height: 80px;
	}

	.field-hint {
		font-size: 0.75rem;
		color: var(--text-tertiary);
		text-align: right;
	}

	.editor-actions {
		display: flex;
		justify-content: space-between;
		gap: 0.75rem;
		margin-top: 0.5rem;
	}

	.editor-actions .btn {
		display: inline-flex;
		align-items: center;
		gap: 0.375rem;
	}

	/* ── Utility ───────────────────────────────────────────────────── */
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
</style>

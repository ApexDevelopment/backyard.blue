<script lang="ts">
	/**
	 * TagInput — chip-style tag entry.
	 * Press comma or enter to commit a tag. Click × to remove.
	 */

	interface Props {
		tags: string[];
		max?: number;
		maxLength?: number;
		disabled?: boolean;
	}

	let { tags = $bindable(), max = 30, maxLength = 128, disabled = false }: Props = $props();

	let inputValue = $state('');
	let inputEl: HTMLInputElement | undefined = $state();

	function commitTag() {
		const raw = inputValue.replace(/,/g, '').trim();
		if (!raw) {
			inputValue = '';
			return;
		}

		const tag = raw.slice(0, maxLength).toLowerCase();

		// Avoid duplicates
		if (tags.includes(tag)) {
			inputValue = '';
			return;
		}

		if (tags.length >= max) {
			inputValue = '';
			return;
		}

		tags = [...tags, tag];
		inputValue = '';
	}

	function removeTag(index: number) {
		tags = tags.filter((_, i) => i !== index);
		inputEl?.focus();
	}

	function handleKeydown(e: KeyboardEvent) {
		if (e.key === 'Enter' || e.key === ',') {
			e.preventDefault();
			commitTag();
		} else if (e.key === 'Backspace' && inputValue === '' && tags.length > 0) {
			// Remove last tag on backspace in empty input
			tags = tags.slice(0, -1);
		}
	}

	function handleInput(e: Event) {
		const target = e.target as HTMLInputElement;
		// If user pastes text with commas, split and commit each tag
		if (target.value.includes(',')) {
			const parts = target.value.split(',');
			for (const part of parts.slice(0, -1)) {
				inputValue = part;
				commitTag();
			}
			inputValue = parts[parts.length - 1];
		}
	}
</script>

<div class="tag-input-container" class:disabled>
	{#each tags as tag, i (tag)}
		<span class="tag-chip">
			#{tag}
			{#if !disabled}
				<button
					type="button"
					class="tag-remove"
					onclick={() => removeTag(i)}
					aria-label="Remove tag {tag}"
				>×</button>
			{/if}
		</span>
	{/each}

	{#if !disabled && tags.length < max}
		<input
			bind:this={inputEl}
			bind:value={inputValue}
			type="text"
			class="tag-text-input"
			placeholder={tags.length === 0 ? 'add tags (press enter or comma)' : 'add another tag...'}
			onkeydown={handleKeydown}
			oninput={handleInput}
			maxlength={maxLength}
			{disabled}
		/>
	{/if}
</div>

<style>
	.tag-input-container {
		display: flex;
		flex-wrap: wrap;
		align-items: center;
		gap: 0.125rem 0.375rem;
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		padding: 0.25rem 0.5rem;
		min-height: 2rem;
		background-color: var(--bg-primary);
		transition: border-color 0.15s ease;
		cursor: text;
		overflow: hidden;
	}

	.tag-input-container:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-light);
	}

	.tag-input-container.disabled {
		opacity: 0.5;
		cursor: default;
	}

	.tag-chip {
		display: inline-flex;
		align-items: center;
		gap: 0.25rem;
		padding: 0.0625rem 0.5rem;
		background-color: color-mix(in srgb, var(--accent) 12%, transparent);
		color: var(--accent);
		border-radius: var(--radius-full);
		font-size: 0.75rem;
		font-weight: 500;
		line-height: 1.5;
		white-space: nowrap;
	}

	.tag-remove {
		display: inline-flex;
		align-items: center;
		justify-content: center;
		width: 1rem;
		height: 1rem;
		padding: 0;
		border: none;
		background: none;
		color: var(--accent);
		font-size: 0.875rem;
		cursor: pointer;
		border-radius: 50%;
		line-height: 1;
		opacity: 0.6;
		transition: opacity 0.1s ease;
	}

	.tag-remove:hover {
		opacity: 1;
		background-color: color-mix(in srgb, var(--accent) 20%, transparent);
	}

	.tag-text-input {
		flex: 1;
		min-width: 80px;
		border: none;
		outline: none;
		background: none;
		color: var(--text-primary);
		font-size: 0.8125rem;
		padding: 0;
		line-height: 1.5;
	}

	.tag-text-input::placeholder {
		color: var(--text-tertiary);
	}
</style>

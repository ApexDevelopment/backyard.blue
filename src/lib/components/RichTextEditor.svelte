<script lang="ts">
	/**
	 * RichTextEditor — contenteditable div with a formatting toolbar.
	 *
	 * Uses a contenteditable div as the editing surface so applied formatting
	 * (bold, italic, underline, strikethrough) is visible inline with the text
	 * and the caret is always correctly positioned.
	 *
	 * Formatting is applied via document.execCommand and the plain text + facets
	 * are extracted by walking the DOM tree on every input.
	 */

	import { Bold, Italic, Underline, Strikethrough } from 'lucide-svelte';

	interface FormatFacet {
		index: { byteStart: number; byteEnd: number };
		features: { $type: string }[];
	}

	interface Props {
		text: string;
		facets: FormatFacet[];
		maxLength?: number;
		disabled?: boolean;
		placeholder?: string;
	}

	let {
		text = $bindable(),
		facets = $bindable(),
		maxLength = 3000,
		disabled = false,
		placeholder = "what's on your mind?"
	}: Props = $props();

	let editorEl: HTMLDivElement | undefined = $state();
	const encoder = new TextEncoder();

	/** When true, the next text change originated from our own syncFromDOM and should not seed the editor. */
	let internalUpdate = false;

	/**
	 * Build an HTML string from plain text + formatting facets so the
	 * contenteditable div shows bold/italic/underline/strikethrough visually.
	 *
	 * Facet byte ranges are converted to character ranges, then each character
	 * position is tagged with its active formats. Adjacent chars with the same
	 * format set are merged into a single HTML run.
	 */
	function buildFormattedHTML(t: string, f: typeof facets): string {
		if (!t) return '';
		if (!f || f.length === 0) return escapeHTML(t);

		// For each character, determine its byte offset so we can map facet byte ranges → char ranges.
		const charByteStart: number[] = [];
		let byteIdx = 0;
		for (const ch of t) {
			charByteStart.push(byteIdx);
			byteIdx += encoder.encode(ch).length;
		}
		const chars = [...t]; // full unicode chars
		const len = chars.length;

		// Per-character format flags
		const bold = new Uint8Array(len);
		const italic = new Uint8Array(len);
		const underline = new Uint8Array(len);
		const strike = new Uint8Array(len);

		for (const facet of f) {
			const bs = facet.index.byteStart;
			const be = facet.index.byteEnd;
			const types = new Set(facet.features.map((ft) => ft.$type));
			const isBold = types.has(BOLD);
			const isItalic = types.has(ITALIC);
			const isUnderline = types.has(UNDERLINE);
			const isStrike = types.has(STRIKE);

			for (let ci = 0; ci < len; ci++) {
				const cb = charByteStart[ci];
				if (cb >= bs && cb < be) {
					if (isBold) bold[ci] = 1;
					if (isItalic) italic[ci] = 1;
					if (isUnderline) underline[ci] = 1;
					if (isStrike) strike[ci] = 1;
				}
			}
		}

		// Merge adjacent chars with the same formatting into runs
		let html = '';
		let ri = 0;
		while (ri < len) {
			const rb = bold[ri], rit = italic[ri], ru = underline[ri], rs = strike[ri];
			let runEnd = ri + 1;
			while (
				runEnd < len &&
				bold[runEnd] === rb &&
				italic[runEnd] === rit &&
				underline[runEnd] === ru &&
				strike[runEnd] === rs &&
				chars[runEnd] !== '\n'
			) {
				runEnd++;
			}

			// Handle newlines as line breaks
			if (chars[ri] === '\n') {
				html += '<br>';
				ri = runEnd;
				continue;
			}

			let chunk = escapeHTML(chars.slice(ri, runEnd).join(''));
			if (rb) chunk = `<b>${chunk}</b>`;
			if (rit) chunk = `<i>${chunk}</i>`;
			if (ru) chunk = `<u>${chunk}</u>`;
			if (rs) chunk = `<s>${chunk}</s>`;
			html += chunk;
			ri = runEnd;
		}

		return html;
	}

	function escapeHTML(s: string): string {
		return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
	}

	/**
	 * Seed the contenteditable div when `text` is set externally (e.g. edit mode pre-fill).
	 * We detect "external" by tracking whether the change came from syncFromDOM.
	 */
	$effect(() => {
		// Subscribe to text and facets so we re-run when either changes
		const t = text;
		const f = facets;
		if (!editorEl) return;
		if (internalUpdate) {
			internalUpdate = false;
			return;
		}
		// External update — populate the div with formatted HTML
		if (t && editorEl.textContent !== t) {
			editorEl.innerHTML = buildFormattedHTML(t, f);
		} else if (!t && editorEl.textContent) {
			editorEl.innerHTML = '';
		}
	});

	// ── Facet type constants ──────────────────────────────
	const BOLD = 'blue.backyard.richtext.facet#bold';
	const ITALIC = 'blue.backyard.richtext.facet#italic';
	const UNDERLINE = 'blue.backyard.richtext.facet#underline';
	const STRIKE = 'blue.backyard.richtext.facet#strikethrough';

	const FORMAT_COMMANDS: Record<string, string> = {
		[BOLD]: 'bold',
		[ITALIC]: 'italic',
		[UNDERLINE]: 'underline',
		[STRIKE]: 'strikeThrough'
	};

	// ── DOM → text + facets extraction ───────────────────

	interface TextRun {
		text: string;
		bold: boolean;
		italic: boolean;
		underline: boolean;
		strikethrough: boolean;
	}

	const NO_FMT: Pick<TextRun, 'bold' | 'italic' | 'underline' | 'strikethrough'> = {
		bold: false,
		italic: false,
		underline: false,
		strikethrough: false
	};

	/**
	 * Recursively walk a DOM node and return text runs with formatting info.
	 * Formatting is inherited from parent elements.
	 */
	function walkNode(
		node: Node,
		b: boolean,
		i: boolean,
		u: boolean,
		s: boolean
	): TextRun[] {
		if (node.nodeType === Node.TEXT_NODE) {
			const t = node.textContent || '';
			if (!t) return [];
			return [{ text: t, bold: b, italic: i, underline: u, strikethrough: s }];
		}

		if (node.nodeType !== Node.ELEMENT_NODE) return [];

		const el = node as HTMLElement;
		const tag = el.tagName.toLowerCase();

		if (tag === 'br') {
			return [{ text: '\n', ...NO_FMT }];
		}

		// Inherit + detect formatting from tags
		let nb = b,
			ni = i,
			nu = u,
			ns = s;
		if (tag === 'b' || tag === 'strong') nb = true;
		if (tag === 'i' || tag === 'em') ni = true;
		if (tag === 'u') nu = true;
		if (tag === 's' || tag === 'strike' || tag === 'del') ns = true;

		// Browsers may use inline styles instead of tags
		const st = el.style;
		if (st.fontWeight === 'bold' || (st.fontWeight && parseInt(st.fontWeight) >= 700))
			nb = true;
		if (st.fontStyle === 'italic') ni = true;
		const td = st.textDecorationLine || st.textDecoration || '';
		if (td.includes('underline')) nu = true;
		if (td.includes('line-through')) ns = true;

		const runs: TextRun[] = [];
		for (const child of el.childNodes) {
			runs.push(...walkNode(child, nb, ni, nu, ns));
		}
		return runs;
	}

	/**
	 * Extract plain text and formatting facets from the editor's DOM.
	 */
	function syncFromDOM() {
		if (!editorEl) return;

		const allRuns: TextRun[] = [];
		const topChildren = Array.from(editorEl.childNodes);

		for (let idx = 0; idx < topChildren.length; idx++) {
			const child = topChildren[idx];

			if (child.nodeType === Node.ELEMENT_NODE) {
				const el = child as HTMLElement;
				const tag = el.tagName.toLowerCase();

				if (tag === 'div' || tag === 'p') {
					// Block element = new line (if not the first block)
					if (idx > 0) {
						allRuns.push({ text: '\n', ...NO_FMT });
					}

					const blockKids = Array.from(el.childNodes);
					for (let j = 0; j < blockKids.length; j++) {
						const bk = blockKids[j];
						// Skip trailing <br> that Chrome inserts in every block
						if (
							j === blockKids.length - 1 &&
							bk.nodeType === Node.ELEMENT_NODE &&
							(bk as HTMLElement).tagName === 'BR' &&
							blockKids.length > 1
						) {
							continue;
						}
						allRuns.push(...walkNode(bk, false, false, false, false));
					}
					continue;
				}
			}

			// Bare text nodes and inline elements
			allRuns.push(...walkNode(child, false, false, false, false));
		}

		// Merge adjacent runs with identical formatting
		const merged: TextRun[] = [];
		for (const run of allRuns) {
			if (!run.text) continue;
			const prev = merged[merged.length - 1];
			if (
				prev &&
				prev.bold === run.bold &&
				prev.italic === run.italic &&
				prev.underline === run.underline &&
				prev.strikethrough === run.strikethrough
			) {
				prev.text += run.text;
			} else {
				merged.push({ ...run });
			}
		}

		// Drop trailing newline (contenteditable artifact)
		if (merged.length > 0) {
			const last = merged[merged.length - 1];
			if (last.text === '\n') {
				merged.pop();
			} else if (last.text.endsWith('\n')) {
				last.text = last.text.slice(0, -1);
				if (!last.text) merged.pop();
			}
		}

		// Build plain text and facets
		let plainText = '';
		const newFacets: FormatFacet[] = [];

		for (const run of merged) {
			const hasFormat = run.bold || run.italic || run.underline || run.strikethrough;
			const byteStart = encoder.encode(plainText).length;
			plainText += run.text;

			if (hasFormat && run.text.length > 0) {
				const byteEnd = encoder.encode(plainText).length;
				const features: { $type: string }[] = [];
				if (run.bold) features.push({ $type: BOLD });
				if (run.italic) features.push({ $type: ITALIC });
				if (run.underline) features.push({ $type: UNDERLINE });
				if (run.strikethrough) features.push({ $type: STRIKE });

				// Merge with previous facet if adjacent and same features
				const last = newFacets[newFacets.length - 1];
				if (
					last &&
					last.index.byteEnd === byteStart &&
					last.features.length === features.length &&
					last.features.every((f) => features.some((f2) => f2.$type === f.$type))
				) {
					last.index.byteEnd = byteEnd;
				} else {
					newFacets.push({ index: { byteStart, byteEnd }, features });
				}
			}
		}

		internalUpdate = true;
		text = plainText;
		facets = newFacets;
	}

	// ── Formatting ──────────────────────────────────────

	function toggleFormat(type: string) {
		if (!editorEl || disabled) return;
		editorEl.focus();
		const command = FORMAT_COMMANDS[type];
		if (command) {
			document.execCommand(command, false);
			syncFromDOM();
			selKey++;
		}
	}

	/** Prevent toolbar buttons from stealing focus from the editor */
	function preventFocusLoss(e: MouseEvent) {
		e.preventDefault();
	}

	// ── Active-state tracking ───────────────────────────

	let selKey = $state(0);

	function queryFormat(type: string): boolean {
		const cmd = FORMAT_COMMANDS[type];
		if (!cmd) return false;
		try {
			return document.queryCommandState(cmd);
		} catch {
			return false;
		}
	}

	let boldActive = $derived(selKey >= 0 && queryFormat(BOLD));
	let italicActive = $derived(selKey >= 0 && queryFormat(ITALIC));
	let underlineActive = $derived(selKey >= 0 && queryFormat(UNDERLINE));
	let strikeActive = $derived(selKey >= 0 && queryFormat(STRIKE));

	// Listen for selection changes document-wide (covers drag-select, arrow keys, etc.)
	$effect(() => {
		const handler = () => {
			selKey++;
		};
		document.addEventListener('selectionchange', handler);
		return () => document.removeEventListener('selectionchange', handler);
	});

	let isEmpty = $derived(!text);

	// ── Event handlers ──────────────────────────────────

	function handleInput() {
		syncFromDOM();
	}

	function handleKeydown(e: KeyboardEvent) {
		const mod = e.ctrlKey || e.metaKey;
		if (!mod) return;

		if (e.key === 'b') {
			e.preventDefault();
			toggleFormat(BOLD);
		} else if (e.key === 'i') {
			e.preventDefault();
			toggleFormat(ITALIC);
		} else if (e.key === 'u') {
			e.preventDefault();
			toggleFormat(UNDERLINE);
		}
	}

	/** Strip pasted HTML — insert as plain text only */
	function handlePaste(e: ClipboardEvent) {
		e.preventDefault();
		const plain = e.clipboardData?.getData('text/plain') || '';
		document.execCommand('insertText', false, plain);
	}
</script>

<div class="rte-container" class:disabled>
	<div class="rte-toolbar">
		<button
			type="button"
			class="rte-btn"
			class:active={boldActive}
			title="Bold (Ctrl+B)"
			onmousedown={preventFocusLoss}
			onclick={() => toggleFormat(BOLD)}
			{disabled}
		>
			<Bold size={16} />
		</button>
		<button
			type="button"
			class="rte-btn"
			class:active={italicActive}
			title="Italic (Ctrl+I)"
			onmousedown={preventFocusLoss}
			onclick={() => toggleFormat(ITALIC)}
			{disabled}
		>
			<Italic size={16} />
		</button>
		<button
			type="button"
			class="rte-btn"
			class:active={underlineActive}
			title="Underline (Ctrl+U)"
			onmousedown={preventFocusLoss}
			onclick={() => toggleFormat(UNDERLINE)}
			{disabled}
		>
			<Underline size={16} />
		</button>
		<button
			type="button"
			class="rte-btn"
			class:active={strikeActive}
			title="Strikethrough"
			onmousedown={preventFocusLoss}
			onclick={() => toggleFormat(STRIKE)}
			{disabled}
		>
			<Strikethrough size={16} />
		</button>
	</div>

	<div class="rte-editor-wrap">
		{#if isEmpty}
			<div class="rte-placeholder" aria-hidden="true">{placeholder}</div>
		{/if}

		<div
			bind:this={editorEl}
			class="rte-editor"
			contenteditable={!disabled}
			role="textbox"
			tabindex="0"
			aria-multiline="true"
			aria-placeholder={placeholder}
			oninput={handleInput}
			onkeydown={handleKeydown}
			onpaste={handlePaste}
		></div>
	</div>
</div>

<style>
	.rte-container {
		border: 1px solid var(--border-color);
		border-radius: var(--radius-sm);
		overflow: hidden;
		background-color: var(--bg-primary);
		transition: border-color 0.15s ease;
	}

	.rte-container:focus-within {
		border-color: var(--accent);
		box-shadow: 0 0 0 3px var(--accent-light);
	}

	.rte-container.disabled {
		opacity: 0.5;
	}

	.rte-toolbar {
		display: flex;
		gap: 0.125rem;
		padding: 0.375rem 0.5rem;
		border-bottom: 1px solid var(--border-color);
		background-color: var(--bg-secondary);
	}

	.rte-btn {
		display: flex;
		align-items: center;
		justify-content: center;
		width: 1.75rem;
		height: 1.75rem;
		padding: 0;
		border: 1px solid transparent;
		border-radius: var(--radius-sm);
		background: none;
		color: var(--text-secondary);
		cursor: pointer;
		transition: all 0.1s ease;
	}

	.rte-btn:hover:not(:disabled) {
		background-color: var(--bg-hover);
		color: var(--text-primary);
	}

	.rte-btn.active {
		background-color: color-mix(in srgb, var(--accent) 15%, transparent);
		color: var(--accent);
		border-color: color-mix(in srgb, var(--accent) 30%, transparent);
	}

	.rte-btn:disabled {
		cursor: default;
		opacity: 0.4;
	}

	/* ── Editor area ─────────────────────────────────── */

	.rte-editor-wrap {
		position: relative;
		min-height: 150px;
	}

	.rte-placeholder {
		position: absolute;
		top: 0.75rem;
		left: 0.75rem;
		right: 0.75rem;
		color: var(--text-tertiary);
		pointer-events: none;
		font-size: 1rem;
		line-height: 1.5;
		user-select: none;
	}

	.rte-editor {
		min-height: 150px;
		padding: 0.75rem;
		color: var(--text-primary);
		font-family: var(--font-sans, system-ui, -apple-system, sans-serif);
		font-size: 1rem;
		line-height: 1.5;
		outline: none;
		white-space: pre-wrap;
		word-wrap: break-word;
		overflow-wrap: break-word;
	}

	.rte-editor:empty {
		min-height: 150px;
	}
</style>

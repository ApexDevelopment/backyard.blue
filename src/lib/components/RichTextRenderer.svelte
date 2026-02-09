<script lang="ts">
	/**
	 * RichTextRenderer — converts AT Protocol rich text (text + facet byte spans)
	 * into properly rendered HTML. Supports mention, link, bold, italic,
	 * underline, and strikethrough facet types.
	 *
	 * AT Protocol facets use byte indices, not character indices, so we must convert
	 * between UTF-8 byte offsets and JS string offsets.
	 */

	interface Facet {
		index: { byteStart: number; byteEnd: number };
		features: { $type: string; uri?: string; did?: string }[];
	}

	interface Props {
		text: string;
		facets?: Facet[];
	}

	let { text, facets }: Props = $props();

	interface Segment {
		text: string;
		link?: string;
		mention?: string;
		bold?: boolean;
		italic?: boolean;
		underline?: boolean;
		strikethrough?: boolean;
	}

	/**
	 * Build rendered segments from text and facets.
	 *
	 * For overlapping facets (e.g. bold span partially overlapping an italic span),
	 * we split into non-overlapping character intervals, each carrying the union of
	 * all features active at that position.
	 */
	function buildSegments(text: string, facets?: Facet[]): Segment[] {
		if (!facets || facets.length === 0) {
			return [{ text }];
		}

		// Encode the text as UTF-8 to map byte offsets → character offsets
		const encoder = new TextEncoder();
		const bytes = encoder.encode(text);

		// Build byte offset → char offset mapping
		const byteToChar: number[] = new Array(bytes.length + 1);
		let byteIdx = 0;
		for (let charIdx = 0; charIdx <= text.length; charIdx++) {
			byteToChar[byteIdx] = charIdx;
			if (charIdx < text.length) {
				const code = text.codePointAt(charIdx)!;
				if (code <= 0x7f) byteIdx += 1;
				else if (code <= 0x7ff) byteIdx += 2;
				else if (code <= 0xffff) byteIdx += 3;
				else {
					byteIdx += 4;
					charIdx++; // skip surrogate pair
				}
			}
		}

		// Convert facets to character-index intervals with resolved features
		interface CharFacet {
			start: number;
			end: number;
			link?: string;
			mention?: string;
			bold?: boolean;
			italic?: boolean;
			underline?: boolean;
			strikethrough?: boolean;
		}

		const charFacets: CharFacet[] = [];
		for (const facet of facets) {
			const s = byteToChar[facet.index.byteStart];
			const e = byteToChar[facet.index.byteEnd];
			if (s === undefined || e === undefined || s >= e) continue;

			const cf: CharFacet = { start: s, end: e };
			for (const feat of facet.features) {
				if (feat.$type === 'app.bsky.richtext.facet#link' && feat.uri) cf.link = feat.uri;
				else if (feat.$type === 'app.bsky.richtext.facet#mention' && feat.did) cf.mention = feat.did;
				else if (feat.$type === 'blue.backyard.richtext.facet#bold') cf.bold = true;
				else if (feat.$type === 'blue.backyard.richtext.facet#italic') cf.italic = true;
				else if (feat.$type === 'blue.backyard.richtext.facet#underline') cf.underline = true;
				else if (feat.$type === 'blue.backyard.richtext.facet#strikethrough') cf.strikethrough = true;
			}
			charFacets.push(cf);
		}

		if (charFacets.length === 0) return [{ text }];

		// Collect all boundary points to split into non-overlapping intervals
		const boundaries = new Set<number>();
		boundaries.add(0);
		boundaries.add(text.length);
		for (const cf of charFacets) {
			boundaries.add(cf.start);
			boundaries.add(cf.end);
		}
		const sorted = [...boundaries].sort((a, b) => a - b);

		const segments: Segment[] = [];
		for (let i = 0; i < sorted.length - 1; i++) {
			const segStart = sorted[i];
			const segEnd = sorted[i + 1];
			if (segStart >= segEnd) continue;

			const seg: Segment = { text: text.slice(segStart, segEnd) };

			// Merge all facets that cover this interval
			for (const cf of charFacets) {
				if (cf.start <= segStart && cf.end >= segEnd) {
					if (cf.link) seg.link = cf.link;
					if (cf.mention) seg.mention = cf.mention;
					if (cf.bold) seg.bold = true;
					if (cf.italic) seg.italic = true;
					if (cf.underline) seg.underline = true;
					if (cf.strikethrough) seg.strikethrough = true;
				}
			}

			segments.push(seg);
		}

		// Merge adjacent segments with identical formatting to reduce DOM nodes
		const merged: Segment[] = [];
		for (const seg of segments) {
			const prev = merged[merged.length - 1];
			if (
				prev &&
				prev.link === seg.link &&
				prev.mention === seg.mention &&
				prev.bold === seg.bold &&
				prev.italic === seg.italic &&
				prev.underline === seg.underline &&
				prev.strikethrough === seg.strikethrough
			) {
				prev.text += seg.text;
			} else {
				merged.push({ ...seg });
			}
		}

		return merged;
	}

	let segments = $derived(buildSegments(text, facets));
</script>

{#each segments as seg}
	{#if seg.link}
		<a
			href={seg.link}
			target="_blank"
			rel="noopener noreferrer"
			class="rt-link"
			class:rt-bold={seg.bold}
			class:rt-italic={seg.italic}
			class:rt-underline={seg.underline}
			class:rt-strike={seg.strikethrough}
		>{seg.text}</a>
	{:else if seg.mention}
		<a
			href="/profile/{seg.text.replace(/^@/, '')}"
			class="rt-mention"
			class:rt-bold={seg.bold}
			class:rt-italic={seg.italic}
			class:rt-underline={seg.underline}
			class:rt-strike={seg.strikethrough}
		>{seg.text}</a>
	{:else if seg.bold || seg.italic || seg.underline || seg.strikethrough}
		<span
			class="rt-formatted"
			class:rt-bold={seg.bold}
			class:rt-italic={seg.italic}
			class:rt-underline={seg.underline}
			class:rt-strike={seg.strikethrough}
		>{seg.text}</span>
	{:else}{seg.text}{/if}
{/each}

<style>
	.rt-link {
		color: var(--text-link);
		text-decoration: underline;
		text-decoration-color: color-mix(in srgb, var(--text-link) 40%, transparent);
	}

	.rt-link:hover {
		text-decoration-color: var(--text-link);
	}

	.rt-mention {
		color: var(--text-link);
		font-weight: 500;
	}

	.rt-mention:hover {
		text-decoration: underline;
	}

	.rt-bold {
		font-weight: 700;
	}

	.rt-italic {
		font-style: italic;
	}

	.rt-underline {
		text-decoration: underline;
	}

	.rt-strike {
		text-decoration: line-through;
	}

	/* Combine underline + strikethrough when both present */
	.rt-underline.rt-strike {
		text-decoration: underline line-through;
	}
</style>

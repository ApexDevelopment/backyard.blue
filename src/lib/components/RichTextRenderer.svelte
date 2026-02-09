<script lang="ts">
	/**
	 * RichTextRenderer — converts AT Protocol rich text (text + facet byte spans)
	 * into properly linked HTML. Supports mention and link facet types.
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
	}

	/**
	 * Convert a JS string offset to a UTF-8 byte offset, and vice versa.
	 * We encode the full text once and build a byte→char mapping.
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

		// Sort facets by byte start position
		const sorted = [...facets].sort((a, b) => a.index.byteStart - b.index.byteStart);

		const segments: Segment[] = [];
		let lastCharIdx = 0;

		for (const facet of sorted) {
			const charStart = byteToChar[facet.index.byteStart];
			const charEnd = byteToChar[facet.index.byteEnd];

			if (charStart === undefined || charEnd === undefined) continue;
			if (charStart < lastCharIdx) continue; // overlapping facet, skip

			// Add plain text before this facet
			if (charStart > lastCharIdx) {
				segments.push({ text: text.slice(lastCharIdx, charStart) });
			}

			// Determine facet type
			const segment: Segment = { text: text.slice(charStart, charEnd) };
			for (const feature of facet.features) {
				if (feature.$type === 'app.bsky.richtext.facet#link' && feature.uri) {
					segment.link = feature.uri;
				} else if (feature.$type === 'app.bsky.richtext.facet#mention' && feature.did) {
					segment.mention = feature.did;
				}
			}
			segments.push(segment);
			lastCharIdx = charEnd;
		}

		// Add remaining plain text
		if (lastCharIdx < text.length) {
			segments.push({ text: text.slice(lastCharIdx) });
		}

		return segments;
	}

	let segments = $derived(buildSegments(text, facets));
</script>

{#each segments as seg}
	{#if seg.link}
		<a href={seg.link} target="_blank" rel="noopener noreferrer" class="rt-link">{seg.text}</a>
	{:else if seg.mention}
		<a href="/profile/{seg.text.replace(/^@/, '')}" class="rt-mention">{seg.text}</a>
	{:else}
		{seg.text}
	{/if}
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
</style>

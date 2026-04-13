import { describe, it, expect } from 'vitest';
import {
	isValidAtUri,
	isValidCid,
	isValidDid,
	clampText,
	clampTags,
	clampJson,
	safeIsoDate,
	escapeLike,
	sanitizeFormatFacets,
	MAX_TEXT_LENGTH,
	MAX_TAGS,
	MAX_TAG_LENGTH,
	MAX_JSON_SIZE,
	MAX_REBLOG_DEPTH
} from '../../src/lib/server/validation.js';

describe('isValidAtUri', () => {
	it('accepts a well-formed AT URI', () => {
		expect(isValidAtUri('at://did:plc:abc123/blue.backyard.feed.post/3abc')).toBe(true);
	});

	it('rejects missing scheme', () => {
		expect(isValidAtUri('did:plc:abc123/blue.backyard.feed.post/3abc')).toBe(false);
	});

	it('rejects empty string', () => {
		expect(isValidAtUri('')).toBe(false);
	});

	it('rejects non-string input', () => {
		expect(isValidAtUri(42 as any)).toBe(false);
		expect(isValidAtUri(null as any)).toBe(false);
	});

	it('rejects URI without rkey', () => {
		expect(isValidAtUri('at://did:plc:abc123/blue.backyard.feed.post')).toBe(false);
	});

	it('rejects URI exceeding 512 characters', () => {
		const long = 'at://did:plc:abc123/blue.backyard.feed.post/' + 'a'.repeat(500);
		expect(isValidAtUri(long)).toBe(false);
	});

	it('accepts did:web authority', () => {
		expect(isValidAtUri('at://did:web:example.com/blue.backyard.feed.post/3abc')).toBe(true);
	});
});

describe('isValidCid', () => {
	it('accepts CIDv0 (Qm prefix, 46 chars)', () => {
		expect(isValidCid('QmYwAPJzv5CZsnN625s3Xf2nemtYgPpHdWEz79ojWnPbdG')).toBe(true);
	});

	it('accepts CIDv1 (b prefix)', () => {
		const cidv1 = 'b' + 'a'.repeat(58);
		expect(isValidCid(cidv1)).toBe(true);
	});

	it('rejects empty string', () => {
		expect(isValidCid('')).toBe(false);
	});

	it('rejects random text', () => {
		expect(isValidCid('not-a-cid')).toBe(false);
	});

	it('rejects non-string input', () => {
		expect(isValidCid(123 as any)).toBe(false);
	});
});

describe('isValidDid', () => {
	it('accepts did:plc', () => {
		expect(isValidDid('did:plc:abc123')).toBe(true);
	});

	it('accepts did:web', () => {
		expect(isValidDid('did:web:example.com')).toBe(true);
	});

	it('rejects missing method', () => {
		expect(isValidDid('did::abc')).toBe(false);
	});

	it('rejects empty string', () => {
		expect(isValidDid('')).toBe(false);
	});

	it('rejects non-string', () => {
		expect(isValidDid(undefined as any)).toBe(false);
	});

	it('rejects DID exceeding 256 characters', () => {
		expect(isValidDid('did:plc:' + 'a'.repeat(250))).toBe(false);
	});
});

describe('clampText', () => {
	it('returns empty string for non-string input', () => {
		expect(clampText(42)).toBe('');
		expect(clampText(null)).toBe('');
		expect(clampText(undefined)).toBe('');
	});

	it('passes through short text unchanged', () => {
		expect(clampText('hello')).toBe('hello');
	});

	it('truncates text exceeding MAX_TEXT_LENGTH', () => {
		const long = 'x'.repeat(MAX_TEXT_LENGTH + 100);
		expect(clampText(long).length).toBe(MAX_TEXT_LENGTH);
	});

	it('respects custom maxLen', () => {
		expect(clampText('abcdefgh', 3)).toBe('abc');
	});
});

describe('clampTags', () => {
	it('returns null for non-array input', () => {
		expect(clampTags('not an array')).toBeNull();
		expect(clampTags(42)).toBeNull();
		expect(clampTags(null)).toBeNull();
	});

	it('filters out non-string and empty entries', () => {
		expect(clampTags(['hello', '', 42, 'world'])).toEqual(['hello', 'world']);
	});

	it('limits to MAX_TAGS entries', () => {
		const many = Array.from({ length: MAX_TAGS + 10 }, (_, i) => `tag${i}`);
		expect(clampTags(many)!.length).toBe(MAX_TAGS);
	});

	it('truncates individual tags to MAX_TAG_LENGTH', () => {
		const longTag = 'a'.repeat(MAX_TAG_LENGTH + 50);
		const result = clampTags([longTag])!;
		expect(result[0].length).toBe(MAX_TAG_LENGTH);
	});

	it('returns empty array for empty input', () => {
		expect(clampTags([])).toEqual([]);
	});
});

describe('clampJson', () => {
	it('returns null for null/undefined', () => {
		expect(clampJson(null)).toBeNull();
		expect(clampJson(undefined)).toBeNull();
	});

	it('serializes a valid object', () => {
		expect(clampJson({ a: 1 })).toBe('{"a":1}');
	});

	it('returns null for oversized JSON', () => {
		const huge = { data: 'x'.repeat(MAX_JSON_SIZE) };
		expect(clampJson(huge)).toBeNull();
	});

	it('returns null for circular references', () => {
		const obj: any = {};
		obj.self = obj;
		expect(clampJson(obj)).toBeNull();
	});
});

describe('safeIsoDate', () => {
	it('returns a valid ISO string for valid input', () => {
		const result = safeIsoDate('2024-01-15T12:00:00Z');
		expect(result).toBe('2024-01-15T12:00:00.000Z');
	});

	it('returns current time for invalid string', () => {
		const before = Date.now();
		const result = safeIsoDate('not-a-date');
		const after = Date.now();
		const resultMs = new Date(result).getTime();
		expect(resultMs).toBeGreaterThanOrEqual(before);
		expect(resultMs).toBeLessThanOrEqual(after);
	});

	it('returns current time for non-string input', () => {
		const before = Date.now();
		const result = safeIsoDate(12345);
		const resultMs = new Date(result).getTime();
		expect(resultMs).toBeGreaterThanOrEqual(before);
	});

	it('handles dates with timezone offsets', () => {
		const result = safeIsoDate('2024-06-15T14:30:00+05:00');
		expect(new Date(result).getTime()).not.toBeNaN();
	});
});

describe('escapeLike', () => {
	it('escapes percent sign', () => {
		expect(escapeLike('100%')).toBe('100\\%');
	});

	it('escapes underscore', () => {
		expect(escapeLike('a_b')).toBe('a\\_b');
	});

	it('escapes backslash', () => {
		expect(escapeLike('a\\b')).toBe('a\\\\b');
	});

	it('leaves normal text unchanged', () => {
		expect(escapeLike('hello world')).toBe('hello world');
	});

	it('escapes multiple metacharacters', () => {
		expect(escapeLike('%_\\')).toBe('\\%\\_\\\\');
	});
});

describe('sanitizeFormatFacets', () => {
	it('returns empty array for non-array input', () => {
		expect(sanitizeFormatFacets(null)).toEqual([]);
		expect(sanitizeFormatFacets('string')).toEqual([]);
		expect(sanitizeFormatFacets(42)).toEqual([]);
	});

	it('passes through valid bold facet', () => {
		const input = [{
			index: { byteStart: 0, byteEnd: 5 },
			features: [{ $type: 'blue.backyard.richtext.facet#bold' }]
		}];
		const result = sanitizeFormatFacets(input);
		expect(result).toHaveLength(1);
		expect(result[0].index).toEqual({ byteStart: 0, byteEnd: 5 });
		expect(result[0].features[0].$type).toBe('blue.backyard.richtext.facet#bold');
	});

	it('filters out unknown feature types', () => {
		const input = [{
			index: { byteStart: 0, byteEnd: 5 },
			features: [
				{ $type: 'blue.backyard.richtext.facet#bold' },
				{ $type: 'evil.injection.type' }
			]
		}];
		const result = sanitizeFormatFacets(input);
		expect(result).toHaveLength(1);
		expect(result[0].features).toHaveLength(1);
	});

	it('drops facets with no valid features', () => {
		const input = [{
			index: { byteStart: 0, byteEnd: 5 },
			features: [{ $type: 'unknown.type' }]
		}];
		expect(sanitizeFormatFacets(input)).toEqual([]);
	});

	it('drops facets with missing index', () => {
		const input = [{
			features: [{ $type: 'blue.backyard.richtext.facet#bold' }]
		}];
		expect(sanitizeFormatFacets(input)).toEqual([]);
	});

	it('drops facets with non-numeric index fields', () => {
		const input = [{
			index: { byteStart: 'zero', byteEnd: 'five' },
			features: [{ $type: 'blue.backyard.richtext.facet#bold' }]
		}];
		expect(sanitizeFormatFacets(input)).toEqual([]);
	});

	it('accepts all four allowed format types', () => {
		const types = [
			'blue.backyard.richtext.facet#bold',
			'blue.backyard.richtext.facet#italic',
			'blue.backyard.richtext.facet#underline',
			'blue.backyard.richtext.facet#strikethrough'
		];
		const input = types.map((t, i) => ({
			index: { byteStart: i * 5, byteEnd: (i + 1) * 5 },
			features: [{ $type: t }]
		}));
		expect(sanitizeFormatFacets(input)).toHaveLength(4);
	});
});

describe('constants', () => {
	it('MAX_TEXT_LENGTH is 3000', () => {
		expect(MAX_TEXT_LENGTH).toBe(3000);
	});

	it('MAX_TAGS is 30', () => {
		expect(MAX_TAGS).toBe(30);
	});

	it('MAX_TAG_LENGTH is 128', () => {
		expect(MAX_TAG_LENGTH).toBe(128);
	});

	it('MAX_JSON_SIZE is 256 KB', () => {
		expect(MAX_JSON_SIZE).toBe(256 * 1024);
	});

	it('MAX_REBLOG_DEPTH is 20', () => {
		expect(MAX_REBLOG_DEPTH).toBe(20);
	});
});

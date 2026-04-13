import { describe, it, expect, vi } from 'vitest';

vi.mock('../../src/lib/server/db.js', () => ({ default: { query: vi.fn() } }));

import {
	isPrivateUrl,
	parseOGTags,
	getAttr,
	resolveUrl,
	decodeEntities
} from '../../src/lib/server/opengraph.js';

describe('isPrivateUrl', () => {
	it('blocks localhost', () => {
		expect(isPrivateUrl('http://localhost/path')).toBe(true);
		expect(isPrivateUrl('http://localhost:3000/path')).toBe(true);
	});

	it('blocks 127.0.0.1', () => {
		expect(isPrivateUrl('http://127.0.0.1/')).toBe(true);
		expect(isPrivateUrl('http://127.0.0.1:8080/path')).toBe(true);
	});

	it('blocks IPv6 loopback', () => {
		expect(isPrivateUrl('http://[::1]/')).toBe(true);
	});

	it('blocks 10.x.x.x range', () => {
		expect(isPrivateUrl('http://10.0.0.1/')).toBe(true);
		expect(isPrivateUrl('http://10.255.255.255/path')).toBe(true);
	});

	it('blocks 172.16–31.x.x range', () => {
		expect(isPrivateUrl('http://172.16.0.1/')).toBe(true);
		expect(isPrivateUrl('http://172.31.255.255/')).toBe(true);
	});

	it('allows 172.15.x.x and 172.32.x.x', () => {
		expect(isPrivateUrl('http://172.15.0.1/')).toBe(false);
		expect(isPrivateUrl('http://172.32.0.1/')).toBe(false);
	});

	it('blocks 192.168.x.x range', () => {
		expect(isPrivateUrl('http://192.168.1.1/')).toBe(true);
		expect(isPrivateUrl('http://192.168.0.1:9090/')).toBe(true);
	});

	it('blocks link-local 169.254.x.x (cloud metadata)', () => {
		expect(isPrivateUrl('http://169.254.169.254/')).toBe(true);
	});

	it('blocks 0.0.0.0/8', () => {
		expect(isPrivateUrl('http://0.0.0.0/')).toBe(true);
	});

	it('blocks IPv6 private ranges', () => {
		expect(isPrivateUrl('http://[fc00::1]/')).toBe(true);
		expect(isPrivateUrl('http://[fd00::1]/')).toBe(true);
		expect(isPrivateUrl('http://[fe80::1]/')).toBe(true);
	});

	it('allows public URLs', () => {
		expect(isPrivateUrl('https://example.com/')).toBe(false);
		expect(isPrivateUrl('https://www.youtube.com/watch?v=abc')).toBe(false);
	});

	it('rejects unparseable URLs', () => {
		expect(isPrivateUrl('not a url')).toBe(true);
	});
});

describe('parseOGTags', () => {
	it('extracts og:title, og:description, og:image', () => {
		const html = `
			<html><head>
				<meta property="og:title" content="My Page">
				<meta property="og:description" content="A description">
				<meta property="og:image" content="https://example.com/img.png">
			</head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title).toBe('My Page');
		expect(result.description).toBe('A description');
		expect(result.image).toBe('https://example.com/img.png');
	});

	it('falls back to Twitter Card tags when OG is absent', () => {
		const html = `
			<html><head>
				<meta name="twitter:title" content="Twitter Title">
				<meta name="twitter:description" content="Twitter Desc">
				<meta name="twitter:image" content="https://example.com/tw.png">
			</head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title).toBe('Twitter Title');
		expect(result.description).toBe('Twitter Desc');
		expect(result.image).toBe('https://example.com/tw.png');
	});

	it('prefers OG over Twitter Card', () => {
		const html = `
			<html><head>
				<meta property="og:title" content="OG Title">
				<meta name="twitter:title" content="Twitter Title">
			</head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title).toBe('OG Title');
	});

	it('falls back to <title> tag', () => {
		const html = `<html><head><title>Page Title</title></head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title).toBe('Page Title');
	});

	it('falls back to meta description', () => {
		const html = `
			<html><head>
				<meta name="description" content="Meta desc">
			</head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.description).toBe('Meta desc');
	});

	it('resolves relative image URLs', () => {
		const html = `
			<html><head>
				<meta property="og:image" content="/images/pic.png">
			</head></html>`;
		const result = parseOGTags(html, 'https://example.com/page');
		expect(result.image).toBe('https://example.com/images/pic.png');
	});

	it('truncates long title to 300 chars', () => {
		const longTitle = 'A'.repeat(400);
		const html = `<html><head><meta property="og:title" content="${longTitle}"></head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title!.length).toBe(300);
	});

	it('truncates long description to 600 chars', () => {
		const longDesc = 'B'.repeat(700);
		const html = `<html><head><meta property="og:description" content="${longDesc}"></head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.description!.length).toBe(600);
	});

	it('decodes HTML entities in extracted text', () => {
		const html = `<html><head><meta property="og:title" content="Tom &amp; Jerry"></head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.title).toBe('Tom & Jerry');
	});

	it('extracts og:site_name', () => {
		const html = `<html><head><meta property="og:site_name" content="MySite"></head></html>`;
		const result = parseOGTags(html, 'https://example.com/');
		expect(result.siteName).toBe('MySite');
	});
});

describe('getAttr', () => {
	it('extracts double-quoted attribute', () => {
		expect(getAttr('property="og:title" content="Hello"', 'content')).toBe('Hello');
	});

	it('extracts single-quoted attribute', () => {
		expect(getAttr("property='og:title' content='Hello'", 'content')).toBe('Hello');
	});

	it('extracts unquoted attribute', () => {
		expect(getAttr('property=og:title content=Hello', 'content')).toBe('Hello');
	});

	it('returns undefined for missing attribute', () => {
		expect(getAttr('property="og:title"', 'content')).toBeUndefined();
	});
});

describe('resolveUrl', () => {
	it('resolves relative URL against base', () => {
		expect(resolveUrl('/img.png', 'https://example.com/page')).toBe('https://example.com/img.png');
	});

	it('returns absolute URL unchanged', () => {
		expect(resolveUrl('https://cdn.example.com/img.png', 'https://example.com/')).toBe('https://cdn.example.com/img.png');
	});

	it('returns src unchanged for invalid base', () => {
		expect(resolveUrl('img.png', 'not-a-url')).toBe('img.png');
	});
});

describe('decodeEntities', () => {
	it('decodes named entities', () => {
		expect(decodeEntities('&amp;')).toBe('&');
		expect(decodeEntities('&lt;')).toBe('<');
		expect(decodeEntities('&gt;')).toBe('>');
		expect(decodeEntities('&quot;')).toBe('"');
		expect(decodeEntities('&#39;')).toBe("'");
		expect(decodeEntities('&apos;')).toBe("'");
	});

	it('decodes numeric decimal entities', () => {
		expect(decodeEntities('&#65;')).toBe('A');
		expect(decodeEntities('&#8212;')).toBe('—');
	});

	it('decodes numeric hex entities', () => {
		expect(decodeEntities('&#x41;')).toBe('A');
		expect(decodeEntities('&#x2014;')).toBe('—');
	});

	it('leaves plain text unchanged', () => {
		expect(decodeEntities('hello world')).toBe('hello world');
	});

	it('handles mixed entities', () => {
		expect(decodeEntities('Tom &amp; Jerry &#8212; &#x2764;')).toBe('Tom & Jerry — ❤');
	});
});

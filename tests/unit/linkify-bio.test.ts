import { describe, it, expect } from 'vitest';
import { linkifyBio } from '../../src/lib/index.js';

describe('linkifyBio', () => {
	it('converts an http URL to a link', () => {
		const result = linkifyBio('Check http://example.com for info');
		expect(result).toContain('<a href="http://example.com"');
		expect(result).toContain('target="_blank"');
		expect(result).toContain('rel="noopener noreferrer"');
		expect(result).toContain('>example.com</a>');
	});

	it('converts an https URL to a link', () => {
		const result = linkifyBio('Visit https://example.com/page');
		expect(result).toContain('<a href="https://example.com/page"');
		expect(result).toContain('>example.com/page</a>');
	});

	it('strips trailing slash from display text', () => {
		const result = linkifyBio('https://example.com/');
		expect(result).toContain('>example.com</a>');
	});

	it('strips protocol from display text', () => {
		const result = linkifyBio('https://www.example.com/path');
		expect(result).toContain('>www.example.com/path</a>');
	});

	it('leaves plain text unchanged', () => {
		expect(linkifyBio('hello world')).toBe('hello world');
	});

	it('escapes HTML entities in surrounding text', () => {
		const result = linkifyBio('<script>alert("xss")</script>');
		expect(result).not.toContain('<script>');
		expect(result).toContain('&lt;script&gt;');
	});

	it('handles multiple URLs', () => {
		const result = linkifyBio('A https://a.com and https://b.com end');
		const matches = result.match(/<a /g);
		expect(matches).toHaveLength(2);
	});

	it('preserves newlines and surrounding text', () => {
		const result = linkifyBio('Line one\nhttps://example.com\nLine three');
		expect(result).toContain('Line one\n');
		expect(result).toContain('\nLine three');
		expect(result).toContain('<a href="https://example.com"');
	});

	it('does not linkify non-http schemes', () => {
		const result = linkifyBio('ftp://files.example.com');
		expect(result).not.toContain('<a');
	});

	it('links a bare domain', () => {
		const result = linkifyBio('Visit example.com for info');
		expect(result).toContain('<a href="https://example.com"');
		expect(result).toContain('>example.com</a>');
	});

	it('links a bare domain with path', () => {
		const result = linkifyBio('Check out example.com/about');
		expect(result).toContain('<a href="https://example.com/about"');
		expect(result).toContain('>example.com/about</a>');
	});

	it('links a bare domain with www', () => {
		const result = linkifyBio('www.example.com');
		expect(result).toContain('<a href="https://www.example.com"');
		expect(result).toContain('>www.example.com</a>');
	});

	it('links a bare domain with subdomain', () => {
		const result = linkifyBio('blog.example.co.uk');
		expect(result).toContain('<a href="https://blog.example.co.uk"');
	});

	it('does not linkify a single word without TLD', () => {
		expect(linkifyBio('hello')).toBe('hello');
	});

	it('links bare domain at start of text', () => {
		const result = linkifyBio('example.com is great');
		expect(result).toContain('<a href="https://example.com"');
	});

	it('links bare domain after newline', () => {
		const result = linkifyBio('Bio here\nexample.com');
		expect(result).toContain('<a href="https://example.com"');
	});

	it('links bare domain inside parentheses', () => {
		const result = linkifyBio('my site (example.com)');
		expect(result).toContain('<a href="https://example.com"');
		expect(result).not.toContain('example.com)');
	});
});

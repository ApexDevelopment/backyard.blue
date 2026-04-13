import { describe, it, expect } from 'vitest';
import { dist2, kMeans, mixToward, rgbStr, type RGB } from '../../src/lib/bannerColors.js';

describe('dist2', () => {
	it('returns 0 for identical colors', () => {
		const c: RGB = { r: 100, g: 150, b: 200 };
		expect(dist2(c, c)).toBe(0);
	});

	it('computes squared Euclidean distance', () => {
		const a: RGB = { r: 0, g: 0, b: 0 };
		const b: RGB = { r: 3, g: 4, b: 0 };
		expect(dist2(a, b)).toBe(25); // 9 + 16 + 0
	});

	it('is symmetric', () => {
		const a: RGB = { r: 10, g: 20, b: 30 };
		const b: RGB = { r: 40, g: 50, b: 60 };
		expect(dist2(a, b)).toBe(dist2(b, a));
	});
});

describe('kMeans', () => {
	it('returns k centroids', () => {
		const pixels: RGB[] = Array.from({ length: 100 }, (_, i) => ({
			r: i < 50 ? 200 : 50,
			g: i < 50 ? 0 : 200,
			b: 100
		}));
		const result = kMeans(pixels, 2);
		expect(result).toHaveLength(2);
	});

	it('clusters distinct color groups', () => {
		const red: RGB[] = Array.from({ length: 50 }, () => ({ r: 255, g: 0, b: 0 }));
		const blue: RGB[] = Array.from({ length: 50 }, () => ({ r: 0, g: 0, b: 255 }));
		const result = kMeans([...red, ...blue], 2);

		const hasRedish = result.some((c) => c.r > 200 && c.b < 50);
		const hasBlueish = result.some((c) => c.b > 200 && c.r < 50);
		expect(hasRedish).toBe(true);
		expect(hasBlueish).toBe(true);
	});

	it('converges to the input when k=1', () => {
		const pixels: RGB[] = [
			{ r: 100, g: 100, b: 100 },
			{ r: 200, g: 200, b: 200 }
		];
		const result = kMeans(pixels, 1);
		expect(result).toHaveLength(1);
		expect(result[0].r).toBe(150);
		expect(result[0].g).toBe(150);
		expect(result[0].b).toBe(150);
	});

	it('returns valid RGB values (0-255 range)', () => {
		const pixels: RGB[] = Array.from({ length: 200 }, () => ({
			r: Math.floor(Math.random() * 256),
			g: Math.floor(Math.random() * 256),
			b: Math.floor(Math.random() * 256)
		}));
		const result = kMeans(pixels, 3);
		for (const c of result) {
			expect(c.r).toBeGreaterThanOrEqual(0);
			expect(c.r).toBeLessThanOrEqual(255);
			expect(c.g).toBeGreaterThanOrEqual(0);
			expect(c.g).toBeLessThanOrEqual(255);
			expect(c.b).toBeGreaterThanOrEqual(0);
			expect(c.b).toBeLessThanOrEqual(255);
		}
	});
});

describe('mixToward', () => {
	it('returns original color at t=0', () => {
		const c: RGB = { r: 100, g: 50, b: 200 };
		const base: RGB = { r: 255, g: 255, b: 255 };
		const result = mixToward(c, base, 0);
		expect(result).toEqual(c);
	});

	it('returns base color at t=1', () => {
		const c: RGB = { r: 100, g: 50, b: 200 };
		const base: RGB = { r: 255, g: 255, b: 255 };
		const result = mixToward(c, base, 1);
		expect(result).toEqual(base);
	});

	it('returns midpoint at t=0.5', () => {
		const c: RGB = { r: 0, g: 0, b: 0 };
		const base: RGB = { r: 200, g: 100, b: 50 };
		const result = mixToward(c, base, 0.5);
		expect(result.r).toBe(100);
		expect(result.g).toBe(50);
		expect(result.b).toBe(25);
	});
});

describe('rgbStr', () => {
	it('formats a color as rgb() string', () => {
		expect(rgbStr({ r: 255, g: 128, b: 0 })).toBe('rgb(255, 128, 0)');
	});

	it('handles zero values', () => {
		expect(rgbStr({ r: 0, g: 0, b: 0 })).toBe('rgb(0, 0, 0)');
	});
});

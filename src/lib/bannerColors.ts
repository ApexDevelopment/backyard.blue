/**
 * Banner color extraction — samples dominant colors from a banner image
 * and produces a CSS gradient string.
 *
 * ═══════════════════════════════════════════════════════════════════════
 * FEATURE FLAG: Set to `false` to disable banner-derived gradients
 * everywhere they're used.
 * ═══════════════════════════════════════════════════════════════════════
 */
export const BANNER_GRADIENT_ENABLED = true;

export interface RGB {
	r: number;
	g: number;
	b: number;
}

/**
 * Detect whether canvas pixel readback is trustworthy.
 *
 * Browsers with fingerprint-resistant settings (e.g. Firefox
 * `privacy.resistFingerprinting`, Brave shields) poison
 * `getImageData()` with random noise. We draw a known solid color
 * and verify the pixels come back unchanged. The result is cached
 * so the probe only runs once per page load.
 */
let canvasProbeResult: boolean | null = null;

function canReadCanvasData(): boolean {
	if (canvasProbeResult !== null) return canvasProbeResult;

	try {
		const c = document.createElement('canvas');
		c.width = 2;
		c.height = 2;
		const ctx = c.getContext('2d');
		if (!ctx) return (canvasProbeResult = false);

		// Fill with a known color and read it back
		ctx.fillStyle = '#7f3f1f';
		ctx.fillRect(0, 0, 2, 2);
		const { data } = ctx.getImageData(0, 0, 2, 2);

		// Every pixel should be exactly (127, 63, 31, 255)
		for (let i = 0; i < data.length; i += 4) {
			if (data[i] !== 127 || data[i + 1] !== 63 || data[i + 2] !== 31 || data[i + 3] !== 255) {
				return (canvasProbeResult = false);
			}
		}
		return (canvasProbeResult = true);
	} catch {
		return (canvasProbeResult = false);
	}
}

/**
 * Load an image URL into an offscreen canvas and return pixel data.
 * Renders the image at a small size (for speed) and reads every pixel.
 */
function samplePixels(src: string, size = 64): Promise<RGB[]> {
	return new Promise((resolve, reject) => {
		const img = new Image();
		img.crossOrigin = 'anonymous';
		img.onload = () => {
			const canvas = document.createElement('canvas');
			canvas.width = size;
			canvas.height = size;
			const ctx = canvas.getContext('2d');
			if (!ctx) return reject(new Error('Canvas context unavailable'));

			ctx.drawImage(img, 0, 0, size, size);
			const { data } = ctx.getImageData(0, 0, size, size);
			const pixels: RGB[] = [];
			for (let i = 0; i < data.length; i += 4) {
				pixels.push({ r: data[i], g: data[i + 1], b: data[i + 2] });
			}
			resolve(pixels);
		};
		img.onerror = () => reject(new Error('Image load failed'));
		img.src = src;
	});
}

/** Euclidean distance² between two colors. */
export function dist2(a: RGB, b: RGB): number {
	const dr = a.r - b.r;
	const dg = a.g - b.g;
	const db = a.b - b.b;
	return dr * dr + dg * dg + db * db;
}

/** Simple k-means to find `k` representative colors. */
export function kMeans(pixels: RGB[], k: number, iterations = 8): RGB[] {
	// Seed centroids by evenly sampling the input
	const step = Math.max(1, Math.floor(pixels.length / k));
	let centroids: RGB[] = [];
	for (let i = 0; i < k; i++) {
		centroids.push({ ...pixels[i * step] });
	}

	for (let iter = 0; iter < iterations; iter++) {
		// Assign pixels to nearest centroid
		const buckets: RGB[][] = centroids.map(() => []);
		for (const px of pixels) {
			let minD = Infinity;
			let best = 0;
			for (let c = 0; c < centroids.length; c++) {
				const d = dist2(px, centroids[c]);
				if (d < minD) {
					minD = d;
					best = c;
				}
			}
			buckets[best].push(px);
		}

		// Recompute centroids
		for (let c = 0; c < centroids.length; c++) {
			const bucket = buckets[c];
			if (bucket.length === 0) continue;
			let sr = 0, sg = 0, sb = 0;
			for (const px of bucket) {
				sr += px.r;
				sg += px.g;
				sb += px.b;
			}
			centroids[c] = {
				r: Math.round(sr / bucket.length),
				g: Math.round(sg / bucket.length),
				b: Math.round(sb / bucket.length)
			};
		}
	}

	return centroids;
}

/**
 * Read the active theme's --bg-secondary from the document root
 * so the gradient blends toward the correct base regardless of scheme.
 */
function getThemeBase(): RGB {
	if (typeof document === 'undefined') return { r: 251, g: 240, b: 224 };

	const raw = getComputedStyle(document.documentElement)
		.getPropertyValue('--bg-secondary')
		.trim();

	// Parse "#rrggbb"
	if (raw.startsWith('#') && raw.length === 7) {
		return {
			r: parseInt(raw.slice(1, 3), 16),
			g: parseInt(raw.slice(3, 5), 16),
			b: parseInt(raw.slice(5, 7), 16)
		};
	}

	// Fallback for unexpected formats
	return { r: 251, g: 240, b: 224 };
}

/**
 * Mix a color toward the theme background.
 * `t` = 0 → fully original color, `t` = 1 → fully theme background.
 */
export function mixToward(c: RGB, base: RGB, t: number): RGB {
	return {
		r: Math.round(c.r + (base.r - c.r) * t),
		g: Math.round(c.g + (base.g - c.g) * t),
		b: Math.round(c.b + (base.b - c.b) * t),
	};
}

export function rgbStr(c: RGB): string {
	return `rgb(${c.r}, ${c.g}, ${c.b})`;
}

/**
 * Extract dominant colors from a banner image URL and return a CSS gradient
 * suitable for a page background.
 *
 * Returns `null` if extraction fails for any reason (CORS, missing canvas, etc.)
 * so callers can simply fall back to the default background.
 *
 * @param bannerUrl - URL of the banner image
 * @param isDark    - Whether the current theme is dark (adjusts muting)
 */
export async function extractBannerGradient(
	bannerUrl: string,
	isDark: boolean
): Promise<string | null> {
	try {
		if (!canReadCanvasData()) return null;

		const pixels = await samplePixels(bannerUrl);
		const colors = kMeans(pixels, 3);

		// Sort by brightness so the gradient has a natural light→dark (or dark→light) flow
		colors.sort((a, b) => {
			const la = a.r * 0.299 + a.g * 0.587 + a.b * 0.114;
			const lb = b.r * 0.299 + b.g * 0.587 + b.b * 0.114;
			return isDark ? la - lb : lb - la;
		});

		// Mix toward the theme background so even vivid banner colors
		// become a subtle tint rather than an overpowering wash.
		// Higher mix = more washed out. Dark mode mixes more aggressively
		// because bright saturated colors are more jarring on dark backgrounds.
		const base = getThemeBase();
		const mix = isDark ? 0.82 : 0.75;
		const muted = colors.map((c) => mixToward(c, base, mix));

		return `linear-gradient(165deg, ${rgbStr(muted[0])} 0%, ${rgbStr(muted[1])} 50%, ${rgbStr(muted[2])} 100%)`;
	} catch {
		return null;
	}
}

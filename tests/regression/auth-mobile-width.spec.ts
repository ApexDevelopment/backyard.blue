import { expect, test } from '@playwright/test';

test.describe('auth mobile card width regression', () => {
	test('login card fills viewport width on mobile', async ({ page }) => {
		await page.goto('/login', { waitUntil: 'networkidle' });

		const authCard = page.locator('.auth-card');
		await expect(authCard).toBeVisible();

		const cardBox = await authCard.boundingBox();
		expect(cardBox).not.toBeNull();
		if (!cardBox) throw new Error('auth card did not produce a bounding box');

		const viewport = page.viewportSize();
		expect(viewport).not.toBeNull();
		if (!viewport) throw new Error('viewport size is unavailable');

		const leftEdge = Math.round(cardBox.x);
		const rightEdge = Math.round(cardBox.x + cardBox.width);
		expect(leftEdge).toBeLessThanOrEqual(1);
		expect(rightEdge).toBeGreaterThanOrEqual(viewport.width - 1);

		await expect(page).toHaveScreenshot('login-mobile-full-width.png', {
			fullPage: true
		});
	});

	test('signup card fills viewport width on mobile', async ({ page }) => {
		await page.goto('/login/create', { waitUntil: 'networkidle' });

		const authCard = page.locator('.auth-card');
		await expect(authCard).toBeVisible();

		const cardBox = await authCard.boundingBox();
		expect(cardBox).not.toBeNull();
		if (!cardBox) throw new Error('auth card did not produce a bounding box');

		const viewport = page.viewportSize();
		expect(viewport).not.toBeNull();
		if (!viewport) throw new Error('viewport size is unavailable');

		const leftEdge = Math.round(cardBox.x);
		const rightEdge = Math.round(cardBox.x + cardBox.width);
		expect(leftEdge).toBeLessThanOrEqual(1);
		expect(rightEdge).toBeGreaterThanOrEqual(viewport.width - 1);

		await expect(page).toHaveScreenshot('signup-mobile-full-width.png', {
			fullPage: true
		});
	});
});

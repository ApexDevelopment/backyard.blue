import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
	testDir: './tests/regression',
	fullyParallel: true,
	forbidOnly: !!process.env.CI,
	retries: process.env.CI ? 2 : 0,
	workers: process.env.CI ? 1 : undefined,
	reporter: 'html',
	use: {
		baseURL: 'http://127.0.0.1:3000',
		trace: 'on-first-retry'
	},
	projects: [
		{
			name: 'mobile-chromium',
			use: {
				...devices['iPhone 13'],
				browserName: 'chromium'
			}
		}
	]
});

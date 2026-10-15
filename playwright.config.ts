import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL: 'http://127.0.0.1:4322/astro-baby-item-recalls/',
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx tsx scripts/accessibility-preview.ts',
    url: 'http://127.0.0.1:4322/astro-baby-item-recalls/',
    timeout: 120_000,
    reuseExistingServer: false,
  },
});

import { defineConfig } from '@playwright/test';

// The port is also hard-coded in scripts/accessibility-preview.ts, which starts the server.
const baseURL = 'http://127.0.0.1:4322/astro-baby-item-recalls/';

export default defineConfig({
  testDir: './e2e',
  use: {
    baseURL,
    browserName: 'chromium',
  },
  webServer: {
    command: 'npx tsx scripts/accessibility-preview.ts',
    url: baseURL,
    timeout: 120_000,
    reuseExistingServer: false,
  },
});

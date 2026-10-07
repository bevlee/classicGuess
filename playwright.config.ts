import { defineConfig } from '@playwright/test';
export default defineConfig({
  testDir: './tests', fullyParallel: false,
  use: { baseURL: 'http://127.0.0.1:5173', browserName: 'chromium' },
  webServer: { command: 'pnpm dev --port 5173', url: 'http://127.0.0.1:5173', reuseExistingServer: true },
  reporter: 'list'
});

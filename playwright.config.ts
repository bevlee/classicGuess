import { defineConfig } from '@playwright/test';
const port = Number(process.env.PLAYWRIGHT_PORT ?? 5173);
export default defineConfig({
  testDir: './tests', fullyParallel: false,
  use: { baseURL: `http://127.0.0.1:${port}`, browserName: 'chromium' },
  webServer: { command: `pnpm dev --port ${port} --strictPort`, url: `http://127.0.0.1:${port}`,
    reuseExistingServer: !process.env.CI, env: process.env.TEST_DATABASE_URL ? { DATABASE_URL: process.env.TEST_DATABASE_URL } : {} },
  reporter: 'list'
});

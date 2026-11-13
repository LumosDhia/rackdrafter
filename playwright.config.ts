import { defineConfig, devices } from '@playwright/test';

const port = 4748;
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: 'e2e',
  globalSetup: './e2e/global-setup.ts',
  fullyParallel: true,
  retries: process.env.CI ? 2 : 0,
  use: {
    baseURL,
    viewport: { width: 1440, height: 900 },
    trace: 'on-first-retry',
  },
  webServer: {
    command: 'node --import tsx src/server/index.ts',
    url: `${baseURL}/api/health`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      PORT: String(port),
      HOST: '127.0.0.1',
      RACKDRAFTER_DB: '.tmp/e2e.db',
      RACKDRAFTER_SEED: '0',
      NODE_ENV: 'test',
      LOG_LEVEL: 'error',
    },
  },
  projects: [{ name: 'chromium', use: { ...devices['Desktop Chrome'] } }],
});

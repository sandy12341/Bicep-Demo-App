import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests',
  testMatch: '**/*.spec.ts',
  fullyParallel: false,
  workers: 1,
  use: { baseURL: 'http://127.0.0.1:3100', channel: 'chromium', trace: 'retain-on-failure' },
  webServer: {
    command: 'node dist/server.js',
    url: 'http://127.0.0.1:3100/healthz',
    reuseExistingServer: false,
    env: { PORT: '3100', DEMO_MODE: 'true', APP_TITLE: 'Classroom Ready', APP_COMMIT: 'browser-test', DEMO_INTEGRATION_SECRET: 'fake-local-secret' },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'mobile', use: { ...devices['iPhone 13'], defaultBrowserType: 'chromium' } },
  ],
});

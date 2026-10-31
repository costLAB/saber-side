import { defineConfig, devices } from '@playwright/test';

// Headless Chromium renders WebGL through SwiftShader (software), so screenshots match across machines.
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };
const PORT = 4173;

export default defineConfig({
  testDir: './e2e',
  // SwiftShader already spreads one page across every core; parallel workers only slow each other down.
  workers: 1,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never' }]] : 'list',
  // Each captured frame is rendered in software and can take several seconds.
  timeout: 120_000,
  expect: {
    // Small tolerance for rasterization noise; real regressions move far more pixels.
    toMatchSnapshot: { maxDiffPixelRatio: 0.01 },
  },
  use: {
    baseURL: `http://localhost:${PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: {
    command: `pnpm build && pnpm preview --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}`,
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
  projects: [
    {
      name: 'macbook',
      use: {
        ...devices['Desktop Chrome'],
        viewport: { width: 1280, height: 800 },
        deviceScaleFactor: 1,
        launchOptions,
      },
    },
    {
      name: 'ipad',
      // Chromium with iPad metrics + touch, so the touch layout is exercised. Real Safari is covered by the device checklist.
      use: { ...devices['iPad Pro 11 landscape'], browserName: 'chromium', deviceScaleFactor: 1, launchOptions },
    },
  ],
});

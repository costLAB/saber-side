import { defineConfig, devices } from '@playwright/test';
import { GAME_PORT, OWNER_KEY, STATION_PORT } from './e2e/ports';

// Headless Chromium renders WebGL through SwiftShader (software), so screenshots match across machines.
const launchOptions = { args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'] };

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
    baseURL: `http://localhost:${GAME_PORT}`,
    trace: 'retain-on-failure',
  },
  webServer: [
    {
      command: `pnpm build && pnpm preview --port ${GAME_PORT} --strictPort`,
      url: `http://localhost:${GAME_PORT}`,
      reuseExistingServer: !process.env.CI,
      timeout: 120_000,
    },
    {
      // A throwaway station server (nothing saved) for the online tests in station.spec.ts. The build itself has no
      // server URL, so every other test stays single-player.
      command: 'pnpm --filter @saber-side/server start',
      // Shops trade an hour a second, settled every second, so a test sees takings straight away.
      env: {
        PORT: String(STATION_PORT),
        DATABASE_PATH: ':memory:',
        ADMIN_KEY: OWNER_KEY,
        SETTLE_SECONDS: '1',
        ECONOMY_SPEED: '3600',
      },
      url: `http://localhost:${STATION_PORT}/healthz`,
      reuseExistingServer: !process.env.CI,
      timeout: 60_000,
    },
  ],
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

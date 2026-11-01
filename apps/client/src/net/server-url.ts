declare global {
  interface Window {
    /** Test-only: points this page at a station server. Set by Playwright before the page loads. */
    SABER_SERVER?: string;
  }
}

/**
 * Which station server this page talks to, if any.
 *
 * - Render builds of the game (render.yaml) carry two: `VITE_SERVER_URL`, the real station, and
 *   `VITE_PREVIEW_SERVER_URL`, the staging server. A PR preview (served at `saber-side-pr-<n>.onrender.com`) joins
 *   staging, so a PR can't touch real data; every other address joins the real station.
 * - `pnpm dev` talks to the local server through Vite's `/colyseus` proxy, which also works over `pnpm dev:https`.
 * - A plain build with neither is single-player only, which is what the screenshot tests run.
 */
export function stationServerUrl(): string | undefined {
  if (window.SABER_SERVER) return window.SABER_SERVER;
  const env = import.meta.env;
  if (env.VITE_PREVIEW_SERVER_URL && isPreview(location.hostname)) return env.VITE_PREVIEW_SERVER_URL;
  if (env.VITE_SERVER_URL) return env.VITE_SERVER_URL;
  if (env.DEV) return `${location.origin}/colyseus`;
  return undefined;
}

/** Whether this page is a PR preview of the game on Render (`<service>-pr-<number>.onrender.com`). */
export function isPreview(hostname: string): boolean {
  return /-pr-\d+\.onrender\.com$/i.test(hostname);
}

declare global {
  interface Window {
    /** Test-only: points this page at a station server. Set by Playwright before the page loads. */
    SABER_SERVER?: string;
  }
}

/**
 * Which station server this page talks to, if any.
 *
 * - Netlify builds get `VITE_SERVER_URL` from `netlify.toml`: production uses the real station, and deploy previews use
 *   the staging server so a PR can't touch real data.
 * - `pnpm dev` talks to the local server through Vite's `/colyseus` proxy, which also works over `pnpm dev:https`.
 * - A plain build with neither is single-player only, which is what the screenshot tests run.
 */
export function stationServerUrl(): string | undefined {
  if (window.SABER_SERVER) return window.SABER_SERVER;
  if (import.meta.env.VITE_SERVER_URL) return import.meta.env.VITE_SERVER_URL;
  if (import.meta.env.DEV) return `${location.origin}/colyseus`;
  return undefined;
}

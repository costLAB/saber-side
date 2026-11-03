import { SETTLE_SECONDS } from '@saber-side/shared';

/** Everything the server reads from its environment. Render sets these (see render.yaml); dev uses the defaults. */
export interface ServerConfig {
  port: number;
  /** The SQLite file. On Render it lives on the persistent disk; `:memory:` keeps nothing (tests). */
  databasePath: string;
  /**
   * Browser origins allowed to join, such as `https://saber-side.onrender.com`. A `*` matches within one part of a
   * hostname, so `https://saber-side-pr-*.onrender.com` covers the game's PR previews. Empty allows every origin,
   * which is the dev default.
   */
  allowedOrigins: string[];
  /** Unlocks the owner panel. Unset turns the owner endpoints off. On Render it's generated (see render.yaml). */
  adminKey: string | undefined;
  /** How often shops' takings and rent are posted to the ledger, in seconds (SETTLE_SECONDS; 300 by default). */
  settleSeconds: number;
  /**
   * How much faster than real time shops earn and pay (ECONOMY_SPEED; 1 by default). Tests turn it up, so an hour
   * of trading passes in a second.
   */
  economySpeed: number;
}

export function readConfig(env: Record<string, string | undefined> = process.env): ServerConfig {
  const port = Number(env.PORT ?? 2567);
  if (!Number.isInteger(port) || port < 0 || port > 65535)
    throw new Error(`PORT must be a port number, not "${env.PORT}"`);
  return {
    port,
    databasePath: env.DATABASE_PATH || 'data/station.db',
    allowedOrigins: (env.ALLOWED_ORIGINS ?? '')
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean),
    adminKey: env.ADMIN_KEY || undefined,
    settleSeconds: positive('SETTLE_SECONDS', env.SETTLE_SECONDS, SETTLE_SECONDS),
    economySpeed: positive('ECONOMY_SPEED', env.ECONOMY_SPEED, 1),
  };
}

function positive(name: string, raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === '') return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n) || n <= 0) throw new Error(`${name} must be a positive number, not "${raw}"`);
  return n;
}

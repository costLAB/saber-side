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
  };
}

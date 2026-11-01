/**
 * Builds the check for which web pages may join (from ALLOWED_ORIGINS). This keeps random sites from embedding the
 * station; it isn't a password, since anything that isn't a browser can claim any origin.
 *
 * - An empty list allows everything (local dev).
 * - A `*` matches letters, digits, and dashes within one part of a hostname, so `https://saber-side-pr-*.onrender.com`
 *   matches `https://saber-side-pr-12.onrender.com` but not `https://saber-side-pr-.evil.com/.onrender.com`.
 * - Requests with no Origin header (health checks, test bots, curl) are allowed: they aren't browsers.
 */
export function originChecker(patterns: readonly string[]): (origin: string | null | undefined) => boolean {
  if (patterns.length === 0 || patterns.includes('*')) return () => true;
  const res = patterns.map(
    (p) =>
      new RegExp(
        `^${p
          .replace(/\/+$/, '')
          .split('*')
          .map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'))
          .join('[a-z0-9-]*')}$`,
        'i',
      ),
  );
  return (origin) => !origin || res.some((re) => re.test(origin));
}

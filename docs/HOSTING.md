# Hosting

The game has two halves that deploy separately:

| Half | Host | Config | What it does |
| --- | --- | --- | --- |
| Client | Netlify | [`netlify.toml`](../netlify.toml) | Static files: the game itself, plus a preview link for every PR |
| Station server | Render | [`render.yaml`](../render.yaml) | `apps/server`: one always-on Node process running the Colyseus room and the SQLite database |

Each Netlify build is told which server to join (`VITE_SERVER_URL` in `netlify.toml`). Production joins the real
station, and deploy previews join a free staging server, so a PR can never touch the real station's data.

## One-time setup

1. **Netlify.** If the site isn't set up yet, import `costLAB/saber-side`; it reads `netlify.toml`, so there's nothing
   to configure. Note the site's address (for example `https://saber-side.netlify.app`).
2. **Render.** Sign in with GitHub and give Render's GitHub app access to `costLAB/saber-side`. Then **New → Blueprint**
   and pick the repo. Render reads `render.yaml` and offers two services:
   - `saber-side-station`, on the Starter plan ($7/month) with a 1 GB disk ($0.25/month). This is the real station.
   - `saber-side-staging`, on the free plan. It sleeps when idle, and the first join after that takes about a minute.

   Before you apply it, check `region` in `render.yaml` (it's `oregon`) and change it to the region closest to the
   players if needed: Render can't move a service later. When asked for `ALLOWED_ORIGINS`, enter:
   - for `saber-side-station`: the site's address, such as `https://saber-side.netlify.app`
   - for `saber-side-staging`: the same with `*--` in front of the name, such as `https://*--saber-side.netlify.app`
     (this matches every deploy preview)
3. **Check the URLs.** Render names each service `https://<name>.onrender.com`, and adds a suffix if the name is taken.
   If either URL differs from `netlify.toml`, change it there and merge.
4. **Check it works.** `https://saber-side-station.onrender.com/healthz` should answer with JSON that includes
   `"ok":true`. Open the game, and under the title it should say **Station · online · 1 aboard**.
5. **Uptime alerts (optional, free).** Point UptimeRobot or Better Stack at the `/healthz` URL so you get an email if the
   station goes down.

## What happens on a merge

- GitHub CI runs as usual.
- Netlify rebuilds the client if the merge touched `apps/client`, `packages/shared`, or the workspace config. Server-only
  merges are skipped, which saves deploy credits.
- Render redeploys both services **after CI passes**, but only if the merge touched `apps/server`, `packages/shared`, or
  the workspace config.
- A server deploy restarts the station. Players see **Station restarting · back in a moment**, and their game rejoins by
  itself, usually within a minute. Nothing is lost: everything that matters is in the database on the disk.
- If a change bumps `PROTOCOL_VERSION` (`packages/shared/src/protocol.ts`), pages from before the change show **Saber
  Side was updated · Reload** instead of half-working.

## Data

- The database is one SQLite file at `/var/data/station.db` on the Render disk, which Render snapshots daily.
  Continuous off-site backups (Litestream to Cloudflare R2) are a follow-up PR.
- Schema changes are migrations in `apps/server/src/db.ts`, applied in order at startup. Never edit one that has
  merged; add a new one. If a deploy is rolled back past a migration, the older server refuses to start rather than
  misread newer data, so redeploy the newer version instead.
- Locally, `pnpm dev` keeps its database in `apps/server/data/` (ignored by git). Delete the folder to start fresh.

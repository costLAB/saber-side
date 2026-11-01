# Hosting

Everything runs on [Render](https://render.com), from one Blueprint, [`render.yaml`](../render.yaml):

| Service | What it is | Plan |
| --- | --- | --- |
| `saber-side` | The game: the built client (`apps/client`), served as static files, plus a preview link for every PR | Free static site |
| `saber-side-station` | The real station: `apps/server`, one always-on Node process running the Colyseus room and the SQLite database | Starter ($7/month) with a 1 GB disk ($0.25/month) |
| `saber-side-staging` | The station PR previews join, so a PR can never touch the real station's data | Free (sleeps when idle) |

The game used to be on Netlify. It moved on 2026-11-01, when Netlify paused production deploys after the team ran out of
credits, and the live game fell behind the station (see the decision in
[the plan's section 6](REFACTOR_PLAN.md#6-hosting-simple-cheap-just-works)).

Every build of the game carries both station URLs (`VITE_SERVER_URL` and `VITE_PREVIEW_SERVER_URL` in `render.yaml`).
The page picks by its own address: a PR preview (`saber-side-pr-<n>.onrender.com`) joins staging, and everything else
joins the real station ([`server-url.ts`](../apps/client/src/net/server-url.ts)).

## One-time setup

1. **Render.** Sign in with GitHub and give Render's GitHub app access to `costLAB/saber-side`. Then **New → Blueprint**
   and pick the repo; Render reads `render.yaml` and offers the three services. If the Blueprint already exists (it
   ran the two station services before the game moved), open it in the Render dashboard and **sync** it, or approve
   the new `saber-side` service it offers, so Render creates the game's static site.

   All three run in Render's `virginia` region, the closest to the players in Boston. Render can't move a service
   later, so changing it means recreating the service.
2. **Check the URLs.** Render names each service `https://<name>.onrender.com`, and adds a suffix if the name is taken.
   The game should be at `https://saber-side.onrender.com`. If any URL differs, update `render.yaml` to match (the
   game's `VITE_SERVER_URL` and `VITE_PREVIEW_SERVER_URL`, the station's `ALLOWED_ORIGINS`, and staging's
   `ALLOWED_ORIGINS`, which covers `https://saber-side-pr-*.onrender.com`) and merge.
3. **Check it works.** `https://saber-side-station.onrender.com/healthz` should answer with JSON that includes
   `"ok":true` and the current `"protocol"`. Open `https://saber-side.onrender.com` and tap **Play**: once you've built
   a robot, the line under the title says **Station · online · 1 aboard · as Bot 1**.
4. **Owner key.** Render generates `ADMIN_KEY` for each station. Copy the station's from its **Environment** page. In
   the game, **Owner** at the bottom of the arrival screen unlocks the owner panel on that device.
5. **Uptime alerts (optional, free).** Point UptimeRobot or Better Stack at the `/healthz` URL so you get an email if the
   station goes down.
6. **Retire the Netlify site.** `https://saberside.netlify.app` serves an old build that the station no longer
   accepts. Delete the `saberside` project in Netlify (or unlink its repository) so nobody lands there by mistake.

## What happens on a merge

- GitHub CI runs as usual.
- Render redeploys each service **after CI passes**, but only the services whose code the merge touched: the game for
  `apps/client`, the stations for `apps/server`, and both for `packages/shared`, the workspace config, or
  `render.yaml`. Docs-only merges deploy nothing.
- A station deploy restarts it. Players see **Station restarting · back in a moment**, and their game rejoins by
  itself, usually within a minute. Nothing is lost: everything that matters is in the database on the disk.
- The game and the station still deploy as two services, so for a minute after a merge one can be newer than the
  other. If a change bumps `PROTOCOL_VERSION` (`packages/shared/src/protocol.ts`), pages from before the change show
  **Saber Side was updated · Reload** instead of half-working.
- Every PR gets a preview of the game at `https://saber-side-pr-<n>.onrender.com`, which joins staging. Staging runs
  `main`, so a PR that bumps `PROTOCOL_VERSION` can't join from its preview until it merges.

## Data

- The database is one SQLite file at `/var/data/station.db` on the Render disk, which Render snapshots daily.
  Continuous off-site backups (Litestream to Cloudflare R2) are a follow-up PR.
- Schema changes are migrations in `apps/server/src/db.ts`, applied in order at startup. Never edit one that has
  merged; add a new one. If a deploy is rolled back past a migration, the older server refuses to start rather than
  misread newer data, so redeploy the newer version instead.
- Locally, `pnpm dev` keeps its database in `apps/server/data/` (ignored by git). Delete the folder to start fresh.

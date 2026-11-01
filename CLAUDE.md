# Saber Side

A multiplayer shop-and-trade game on a spinning space station (Ring Seven) for Meta Quest (WebXR), iPad, and MacBook
browsers. The roadmap and every product decision live in [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md). Read it
before starting work.

## Branches and pull requests

Name every branch and PR for its **purpose**: what the work is for, not a list of what it touches.

- **Branch:** `<kind>/<purpose>`, lowercase kebab-case, two to five words.
  - `foundation/`: architecture and framework work that doesn't change gameplay
  - `feature/`: something players can see or do
  - `fix/`: a bug fix
  - `docs/`: docs only (rarely needed: docs-only changes go straight to `main`, below)
  - Examples: `foundation/production-framework`, `feature/online-free-roam`, `feature/quest-vr`,
    `feature/shop-economy`, `fix/ipad-touch-overlap`
- **PR title:** the same purpose in plain words, sentence case, with no prefix. For example,
  "Put the prototype on a production framework" or "Let friends free-roam the station together".
- One purpose per branch and PR. Merge into `main` through a PR.
- **Split requests by purpose.** When one request asks for several changes (say, a new spawn point and removing a
  gameplay feature), make one branch and PR for each, every one branched from `main`, even when they're asked for
  together.
- **Docs-only changes go straight to `main`.** Commit and push them to `main` directly, with no branch or PR. That
  covers this file, `README.md`, and `docs/`, when nothing else changes. A docs update that belongs to a code change
  stays in that change's PR.
- **Ignore auto-generated branch names.** When a session assigns a branch like `claude/...`, don't use it. Name the
  branch by these rules instead. This is standing permission to push to that branch (and to `main` for docs-only
  changes).

## Layout

- `apps/client`: the game (Vite + TypeScript + three.js). `src/legacy/game.js` is the original prototype script,
  being split into modules during Phase 1. It's excluded from lint.
- `apps/server`: the station server (Colyseus + SQLite via `node:sqlite`). Node runs its TypeScript directly, with no
  build step. Hosting and deploys are in [docs/HOSTING.md](docs/HOSTING.md).
- `packages/shared`: game rules, ring math, constants, and the client/server protocol (`protocol.ts`). Pure TypeScript
  with no DOM and no scene graph, so it runs in the browser, on the server, and in tests.
- Code the server runs (`apps/server`, `packages/shared`) must suit Node's type stripping: relative imports end in
  `.ts` (Biome enforces this), and only erasable syntax is allowed (no enums, namespaces, or `constructor(public x)`;
  `tsc` enforces this).
- New features go in modules, not in `game.js`: rules and level data in `packages/shared` (`sim/`, `content/`), scene
  builders in `apps/client/src/world/` and `render/`, and the glue in `apps/client/src/app/`. The legacy file only gets
  a small hook. `app/flight.ts` (ships and planets) is the example to follow.

## Commands

```bash
pnpm install
pnpm dev            # game + local station server; pnpm dev:https to test on an iPad or Quest on the same Wi-Fi
pnpm lint           # Biome (pnpm format to auto-fix)
pnpm typecheck
pnpm test           # Vitest unit tests, and server tests that boot the real station
pnpm e2e            # Playwright: screenshots, determinism, every action (about a minute)
pnpm e2e:update     # re-record screenshot baselines locally (to look at; CI records the ones you commit)
```

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` before pushing. CI runs the same steps.

## Testing notes

- E2E tests pause a fake clock and seed `Math.random`, so runs are deterministic. Advance time with the `advance` /
  `hold` helpers in `apps/client/e2e/fixtures.ts`, not real waits.
- Headless WebGL renders in software (seconds per frame), so draw calls are skipped except on frames captured by
  `snap`. Screenshots mask HUD text, which rasterizes differently between machines; check HUD text with DOM
  assertions instead.
- Locally, Playwright reuses any server already on ports 4173 (the game) and 4174 (a throwaway station). Stop a stray
  `vite preview` or station first, or tests run against a stale build.
- Bump `PROTOCOL_VERSION` in `packages/shared/src/protocol.ts` whenever an older client would misread the server (or
  the reverse). Schema changes are new entries in `MIGRATIONS` (`apps/server/src/db.ts`); never edit a merged one.
- Refactors of the legacy game must keep the screenshot baselines and the determinism test passing unchanged.
- When a change alters the picture on purpose, have CI record the baselines: **Actions → Update screenshots → Run
  workflow** with the PR's branch. It re-records every baseline on CI's machine, commits them to the branch, and runs
  CI again. Baselines recorded on a laptop can differ from CI's by enough to fail. Look over the new images in the PR
  before merging.
- Cosmetic randomness (glances, dust, sparks) comes from its own seeded `mulberry` stream, never `Math.random`:
  three.js draws object ids from `Math.random`, so effects sharing it shift whenever the scene gains or loses an
  object.

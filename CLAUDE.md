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
  - `docs/`: docs only
  - Examples: `foundation/production-framework`, `feature/online-free-roam`, `feature/quest-vr`,
    `feature/shop-economy`, `fix/ipad-touch-overlap`
- **PR title:** the same purpose in plain words, sentence case, with no prefix. For example,
  "Put the prototype on a production framework" or "Let friends free-roam the station together".
- One purpose per branch and PR. Merge into `main` through a PR.

## Layout

- `apps/client`: the game (Vite + TypeScript + three.js). `src/legacy/game.js` is the original prototype script,
  being split into modules during Phase 1. It's excluded from lint.
- `packages/shared`: game rules, ring math, and constants. Pure TypeScript with no DOM and no scene graph, so it runs
  in the browser, on the server, and in tests.

## Commands

```bash
pnpm install
pnpm dev            # dev server; pnpm dev:https to test on an iPad or Quest on the same Wi-Fi
pnpm lint           # Biome (pnpm format to auto-fix)
pnpm typecheck
pnpm test           # Vitest unit tests
pnpm e2e            # Playwright: screenshots, determinism, every action (about a minute)
pnpm e2e:update     # re-record screenshot baselines after an intended visual change
```

Run `pnpm lint && pnpm typecheck && pnpm test && pnpm e2e` before pushing. CI runs the same steps.

## Testing notes

- E2E tests pause a fake clock and seed `Math.random`, so runs are deterministic. Advance time with the `advance` /
  `hold` helpers in `apps/client/e2e/fixtures.ts`, not real waits.
- Headless WebGL renders in software (seconds per frame), so draw calls are skipped except on frames captured by
  `snap`. Screenshots mask HUD text, which rasterizes differently between machines; check HUD text with DOM
  assertions instead.
- Locally, Playwright reuses any server already on port 4173. Stop a stray `vite preview` first, or tests run against
  a stale build.
- Refactors of the legacy game must keep the screenshot baselines and the determinism test passing unchanged.

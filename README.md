# saber-side
Saber Side: a multiplayer shop-and-trade game on a spinning space station, for Meta Quest, iPad, and MacBook browsers.

## Saber Side (web prototype)

A rusty ball-bodied robot who lives on Ring Seven, an 800 ft spinning cylinder habitat, built with Three.js. The game is being refactored into a multiplayer shop-and-trade game for Meta Quest, iPad, and MacBook; see the [roadmap](#roadmap).

### Running it

Needs Node 22+ and pnpm (`corepack enable` sets pnpm up from `package.json`).

```bash
pnpm install
```

```bash
pnpm dev
```

Then open the printed URL. To try it on an iPad or Quest on the same Wi-Fi, run `pnpm dev:https` and open the `https://` network URL (WebXR needs HTTPS; accept the self-signed certificate warning).

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm dev:https` | Dev server with hot reload |
| `pnpm build` / `pnpm preview` | Production build in `apps/client/dist`, and a server for it |
| `pnpm lint` / `pnpm format` | Biome lint and format check / auto-fix |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit tests |
| `pnpm e2e` | Playwright tests: MacBook and iPad screenshots, a determinism check, every action |
| `pnpm e2e:update` | Re-record screenshot baselines after an intended visual change |

The screenshot tests pause time and seed randomness, so every run renders the same frames. If a change is supposed to alter the picture, run `pnpm e2e:update` and commit the new images in `apps/client/e2e/game.spec.ts-snapshots/`.

### Controls

| Key | Action |
| --- | --- |
| ↑ ↓ | Roll forward / back |
| ← → | Turn |
| Shift (hold) | 5× speed |
| Space | Jump (in the hub: rise) |
| X | Spin attack |
| G | Pick up / drop, ride a lift |
| F | Use: ignite saber, fire blaster, bite carrot |
| Q E, drag | Orbit camera |
| − +, scroll | Zoom |
| C, double-click | Reset camera |
| R | Restack crates |

The ring is 800 ft across with an 85 ft hull, 400 ft long, and spins at 3.05 rpm for 1 g at the floor. Four lift tubes run from the promenade to a zero-gravity hub on the axis.

## Roadmap

See [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md) for the plan to grow this prototype into a multiplayer game for browsers, iPad, and WebXR headsets.

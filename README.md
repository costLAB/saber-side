# saber-side
Saber Side: a multiplayer shop-and-trade game on a spinning space station, for Meta Quest, iPad, and MacBook browsers.

## Saber Side (web prototype)

A rusty ball-bodied robot who lives on Ring Seven, an 800 ft spinning cylinder habitat, built with Three.js. The game is being refactored into a multiplayer shop-and-trade game for Meta Quest, iPad, and MacBook; see the [roadmap](#roadmap).

### Running it

Needs Node 22.18+ and pnpm (`corepack enable` sets pnpm up from `package.json`).

```bash
pnpm install
```

```bash
pnpm dev
```

This starts the game and a local station server together. Open the printed URL, make a robot, and under the title it should say **Station · online · 1 aboard**. A second browser window (or a private one) can come aboard as another robot. Locally the owner panel is off unless you start with `ADMIN_KEY=something pnpm dev`. To try it on an iPad or Quest on the same Wi-Fi, run `pnpm dev:https` and open the `https://` network URL (WebXR needs HTTPS; accept the self-signed certificate warning).

| Command | What it does |
| --- | --- |
| `pnpm dev` / `pnpm dev:https` | Game (hot reload) and station server (restarts on change) |
| `pnpm build` / `pnpm preview` | Production build in `apps/client/dist`, and a server for it |
| `pnpm lint` / `pnpm format` | Biome lint and format check / auto-fix |
| `pnpm typecheck` | TypeScript |
| `pnpm test` | Unit tests, plus server tests that boot the real station |
| `pnpm e2e` | Playwright tests: MacBook and iPad screenshots, a determinism check, every action, joining the station |
| `pnpm e2e:update` | Re-record screenshot baselines locally, to look at an intended visual change |

The screenshot tests pause time and seed randomness, so every run renders the same frames. If a change is supposed to alter the picture, run **Actions → Update screenshots** on GitHub with the PR's branch: it re-records the images in `apps/client/e2e/game.spec.ts-snapshots/` on CI's own machine, commits them to the branch, and runs CI again. (`pnpm e2e:update` does the same locally, but baselines recorded on a laptop can differ from CI's.)

### Deploying

Netlify hosts the game (`netlify.toml`) and gives each PR a preview link. Render runs the station server (`render.yaml`), with the SQLite database on a persistent disk. Previews join a separate staging server, so they never touch the real station. [docs/HOSTING.md](docs/HOSTING.md) has the one-time setup and what happens on each merge.

### Coming aboard

With a station server (always in `pnpm dev`, and on the hosted game), the game opens on the arrival screen. **Play** builds a robot and rolls it out as a guest, with a name like "Bot 1" and nothing saved. To keep it, drive into the **Robot Registry** next to the Bot Maker and register with a username and a PIN. Registered players **Log in** with a username and a 4-digit PIN instead, and find their robots as they left them; there are no accounts beyond that, so the same login works on the iPad, the MacBook, and the Quest. Each player has one seat: coming aboard from a second device takes over from the first. Drive back into the Bot Maker to rebuild your robot; registered players can also rename it there, and keep up to 5 robots and switch between them (the first is free, and each extra one costs Cyber Crystals). Your balance shows under the station line as `12 ◆ 45` (12 CC and 45 shards). Owners can unlock the owner panel (**Owner**, with the server's `ADMIN_KEY`) to rename players and robots, reset a forgotten PIN, remove them, grant Cyber Crystals, and reverse ledger entries. The plan is in [Players, their robots, and seats](docs/initiatives/players-and-robots.md).

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

The ring is 800 ft across with an 85 ft hull, 400 ft long, and spins at 3.05 rpm for 1 g at the floor. Four lift tubes run from the promenade to a zero-gravity hub on the axis.

In the hub, four little ships wait in cradles beside two airlocks. Board one (G) and it launches into space, where you can fly to Earth, Mars, Glorp and Frostbite, land, and zap the little aliens. Fly into a glowing dock at either end of Ring Seven to come home.

| Ship key | Action |
| --- | --- |
| ↑ ↓ | Climb / dive |
| ← → | Turn |
| Shift (hold) | 5× speed |
| Space | Brake |
| F | Fire lasers |
| X | Barrel roll |

## Roadmap

See [docs/REFACTOR_PLAN.md](docs/REFACTOR_PLAN.md) for the plan to grow this prototype into a multiplayer game for browsers, iPad, and WebXR headsets.

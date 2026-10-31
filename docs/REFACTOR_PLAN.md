# Saber Side: Refactor Game Plan

**Goal:** turn the single-file prototype (`index.html`, about 2,000 lines) into a codebase that can grow into a **persistent multiplayer shop-and-trade game for a group of friends**, playable on:

| Platform | Session | Input |
| --- | --- | --- |
| Meta Quest (Quest Browser) | WebXR `immersive-vr` | Touch controllers, hand tracking |
| iPad (Safari) | Flat browser, first-class | Touch, plus keyboard/trackpad or gamepad when connected |
| MacBook (Safari / Chrome) | Flat browser | Keyboard + trackpad/mouse, optional gamepad |

All three platforms play together in the same world. Rooms hold **10 players**.

**Product decisions from the owner (2026-10-31):**

- Great flat play on iPad. **No AR.** VR is on Meta Quest.
- The game is called **Saber Side** (formerly Rustball).
- 10 players per room.
- VR and flat players interact. **No fighting yet.** The core loop is **running stores and selling things to each other**. It's a fun economy with no real money: store owners get regular revenue, pay rent and other operating costs, and pay to open new stores. The first store is free.
- Cheap hosting is fine. It's for kids and friends, not production grade, but it should just work.
- Voice chat would be great (friends only, no moderation needed), but it's lower priority.
- Stay on WebXR rather than moving to Unity (see [section 9](#9-unity-or-webxr)).

---

## 1. What we have today

`index.html` is one IIFE with a single global mutable state, `st`. Good things to keep:

- **The ring-bend technique** (`index.html:161-199`). Floor content is simulated on a flat strip (x across, z around, y up) and bent onto the cylinder in the vertex shader. This keeps physics simple and works per eye in XR, because the bend happens in world space before `viewMatrix`.
- **Procedural shops already exist** (`buildShop`, `makeSign`, `index.html:675-809`). They become the rentable storefronts.
- **Crates labeled "BOLTS"** and grabbable items (sabers, blaster, carrot). These become the starter money source and the first merchandise.
- **Abstract actions:** input fills `keys` / `pressed` with action names, and there's a touch pad that feeds the same map (`index.html:1241-1294`).
- **Blob shadows instead of shadow maps**, plus instanced and batched static parts. Both are right for Quest performance.

Problems that block scale, VR, or multiplayer:

| # | Problem | Where | Why it matters |
| --- | --- | --- | --- |
| P1 | **The scene graph is the simulation state.** `bot.root.position` is the player position, and crates and items store state on their meshes. | `update()` `:1412+`, `updateCrates`, `updateItems` | You can't run the game on a server or in tests, and you can't have more than one player. |
| P2 | **One player, hard-wired.** `bot`, `st`, `held`, and `cam` are singletons. | throughout | Multiplayer needs up to 10 avatars, of which one is local. |
| P3 | **Simulation, input, animation, camera, and FX are interleaved in one 300-line `update()`.** | `:1412-1705` | You can't swap in a VR controller or camera rig. |
| P4 | **Variable timestep.** | `frame()` `:1757` | Networking and reproducible tests need a fixed tick. |
| P5 | **25 `Math.random()` calls**, some of which change game state (crate knockback `:1485`, item tumble `:1155`). | throughout | Different players' screens would disagree about where things are. |
| P6 | **One PointLight per saber** (`:1097`). | `makeSaber` | Sabers will be merchandise, so there will be many of them. Every light costs every lit pixel, and a changing light count forces shader recompiles. Quest frame rate would collapse. |
| P7 | **Units:** 1 scene unit = 0.364 m. | `FT` `:155` | WebXR works in meters. |
| P8 | **"Real space" via a height sentinel:** anything with y > 5000 is drawn unbent (`REAL_OFF`). | `:572` | An invisible coupling that should live behind one API. |
| P9 | **three.js r128 from a CDN** (2021). | `:128` | Hand tracking, foveation, and multiview need a current three.js. |
| P10 | **No build, types, tests, CI, or persistence.** The `.gitignore` is a Unity template. | repo root | A persistent economy needs a database and a safety net. |

---

## 2. Key decisions

### D1. Monorepo: TypeScript + Vite + pnpm workspaces

- `apps/client`: Vite, strict TypeScript, three.js pinned to an exact current release, `WebGLRenderer`.
- `apps/server`: Node + TypeScript + Colyseus + SQLite.
- `packages/shared`: pure TypeScript game rules, constants, ring math, economy rules, and network protocol. No DOM and no scene graph (three's math classes are fine), so it runs in the browser, on the server, and in tests.
- Tooling: Biome (lint + format), Vitest, Playwright, GitHub Actions.

### D2. The simulation owns the state, rendering only reads it

- A fixed 60 Hz tick over plain data. Rendering interpolates between ticks.
- Entities are plain objects grouped by component, and systems are functions over them. Hand-rolled to start; a small ECS library only if needed later.
- The render layer maps `entityId → Object3D` and syncs every frame. Gameplay never touches meshes.
- A seeded RNG for anything that changes game state. Cosmetic effects use an injected RNG so tests can pin it.

### D3. Meters everywhere, player scale on the VR rig

- **1 unit = 1 meter.** Every constant is converted once (gravity of 28 u/s² is about 10.2 m/s², which checks out).
- The robot is 1.22 m tall. In VR, the rig scales headset eye height to robot eye height, using one `playerScale` setting. Kids are already close to that height.

### D4. All ring math lives in one module (`shared/ring-space.ts`)

- Every entity is in one of two frames: `strip` (floor, simulated flat, drawn bent) or `real` (lift tubes, hub, end caps).
- The module owns `bendPoint` / `unbend` / `wrapD`, frame conversions, and the GLSL chunk. `REAL_OFF` becomes a renderer detail.

### D5. One avatar format for every platform

Every avatar is networked as an **embodied pose**: root (frame + position + yaw), head, left hand, right hand, and per-hand state (gripping, holding item id).

- **Quest players** fill it from the headset and controllers or hands.
- **iPad and MacBook players** drive the root with stick or keys, and an animation layer generates head and hand poses from what they're doing (carrying, waving, placing an item on a shelf).
- Everyone renders the same way, so a VR kid handing a carrot to an iPad kid looks right on both screens.

### D6. Controllers are separate from input devices

```
devices (keyboard, mouse/trackpad, touch, gamepad, xr-controller, xr-hand)
   → action map / pose stream   (per-profile bindings)
   → controller                 (PilotedController | EmbodiedController)
   → avatar intent              (written into the sim each tick)
```

Profiles hot-swap: a keyboard on the iPad hides the touch UI, a gamepad switches bindings, and entering VR swaps controllers without dropping the connection.

### D7. Multiplayer: clients own their bodies, the server owns the world and every Bolt

- **Movement is client-owned.** VR arm locomotion can't be predicted well by a server. Clients stream poses at about 30 Hz, and the server applies light sanity checks.
- **The server is authoritative** for item ownership, crates, lifts, stores, inventory, prices, and **every currency change**. Clients *request* ("buy item 812 for 40 Bolts"), and the server validates, applies, and broadcasts the result.
- Remote avatars render about 100 ms behind, from an interpolation buffer.
- **Stack:** Node + **Colyseus** (rooms, reconnection, binary state sync) over WebSocket, which works everywhere including Quest Browser and Safari. Colyseus also has a Unity/C# client SDK, which keeps a future native Quest client possible against the same server.

### D8. Persistent worlds, one per friend group

- A **world** is one Ring Seven with its own storefronts and economy, identified by a short **world code** (for example `BOLT-42`). Up to 10 players are online in it at once.
- **SQLite** on the server's disk stores the state. A world loads when the first player joins and saves continuously (the ledger is append-only) and on the last player leaving.
- **Identity, kept simple:** the first visit creates a profile (display name + robot color) held as a device token. To use the same profile on another device (Quest *and* iPad), show a 6-digit **link code** on one device and type it on the other. The world owner (you) can re-issue a code if a device gets wiped.
- An **owner panel** for the world creator: tweak economy multipliers, grant Bolts, reset a store. Useful when a kid gets stuck or broke.

### D9. Lights budget: emissive, not lights

Sabers get emissive cores plus additive glow sprites, with **no light per saber**. If dynamic glow is wanted, use a fixed pool of 2-4 lights assigned to the nearest lit sabers.

---

## 3. The economy (core game loop)

### Loop

> Bash crates for starter Bolts → lease your free first store → buy stock at the Depot → set prices and stock shelves → earn from robot shoppers and friends → pay rent and bills each day → save up → open a second store or upgrade.

### Money

- **Currency: Bolts.** New players start with about 200.
- **Every change is a ledger entry**: who, to whom, how much, why, and on which game day. Balances are derived from the ledger. This rules out duplication bugs and makes daily statements trivial.
- **Money comes in from:**
  - robot (NPC) shoppers buying from stores
  - bashing crates (tiny amounts)
  - odd jobs, such as delivery runs between stores (later)
  - a small daily allowance so nobody is stuck at zero
- **Money goes out on:**
  - rent
  - clerk wages
  - utilities
  - wholesale stock
  - store build-out and upgrades (capex)

  Player-to-player sales just move Bolts between players.

### Storefronts

- Each shop slot on the promenade is a **lot** with a size (S/M/L) and a **foot-traffic score**. Lots near the lifts and the welcome arch get more traffic.
- **Rent per game day** = base × size × traffic. Busy spots earn more and cost more. That's the core decision.
- Vacant lots show a "FOR LEASE" sign. Walk up and lease from the kiosk.
- **First store: no build-out cost**, plus 3 rent-free days. **Each additional store costs capex** (a build-out fee scaled by size, rising with each store you already own, so one kid can't buy the whole ring).
- **Upgrades are capex too:** more shelf slots, a better sign, display lighting (raises appeal), and a **clerk bot**. The clerk costs wages but keeps the store selling while you're offline.

### Goods

- **Launch catalog:**
  - sabers (in colors)
  - blasters
  - carrots
  - robot cosmetics: hats, paint, antenna toppers
  - store decorations
- **The Depot** is the NPC wholesaler, located at the hub so the lifts matter. Owners buy stock at wholesale and choose retail prices.
- **Stocking:** in VR you physically place items on shelf slots, where they snap into place. On flat devices you tap a slot, then pick an item from your inventory.
- **Buying:**
  - Flat: tap or click an item to see its price card, then Buy.
  - VR: grab it off the shelf (its tag glows "unpaid") and set it on the register pad, or press Buy on your wrist.
- **Later:** crafting (combine parts into new goods) and direct player-to-player trades with a confirm step.

### Revenue from robot shoppers

- The server runs a **demand simulation**. Each game hour, every open, stocked store gets visits = traffic × appeal × (number of shoppers on the ring). Each visitor buys with a probability that falls as price rises above the item's reference price.
- This is the **regular revenue stream**, and it rewards good spots, good stock, and fair prices.
- A handful of cosmetic robot shoppers wander the promenade and walk out of stores carrying what they "bought". Clients render them from server events. They're cheap and fun.

### Time

- **Online:** the world clock runs **1 game day per 20 real minutes** (tunable). At closing time a bell rings and each owner gets a **daily statement**: sales, rent, wages, utilities, profit.
- **Offline:** the world is frozen, so kids aren't punished for going to school. Stores **with a clerk** keep trading during "away time", capped at 3 game days, and on return the owner sees a "While you were away" summary. This is computed when the world loads, so no server has to run 24/7.

### Kid-friendly guardrails

- Balances can't go below zero. A store that can't pay rent goes "Closed for repairs" (no sales) until it's paid. After 5 unpaid days it's returned to vacant, and its stock goes back to the owner's inventory, never lost.
- A daily allowance and crate bashing guarantee a way back from zero.
- Every number (rent, prices, demand, day length) lives in one config file and can be tuned in the owner panel.

### Data model (SQLite)

```
worlds(id, code, name, owner_player_id, game_day, game_time, settings_json)
players(id, display_name, color, created_at)
devices(token_hash, player_id)             link_codes(code, player_id, expires_at)
world_members(world_id, player_id, joined_at)
lots(world_id, lot_id, size, traffic)      -- seeded from shared/content
stores(id, world_id, lot_id, owner_id, name, sign_json, status, upgrades_json, opened_day)
items(id, world_id, type, owner_id, location_kind, location_ref, price)
ledger(id, world_id, ts, game_day, from_acct, to_acct, amount, reason, ref)
```

---

## 4. Target repository layout

```
saber-side/
├─ package.json            pnpm workspaces: dev, build, test, lint, e2e
├─ tsconfig.base.json      biome.json      .github/workflows/ci.yml
├─ apps/
│  ├─ client/
│  │  ├─ index.html        HUD markup only
│  │  └─ src/
│  │     ├─ main.ts        boot: detect capabilities → pick profile → app state machine
│  │     ├─ app/           loop (fixed tick + interp), states: boot/title/world-select/play/vr, settings
│  │     ├─ platform/      profiles: desktop | touch | vr
│  │     ├─ input/         actions.ts, devices/*, bindings/*
│  │     ├─ controllers/   piloted.ts, embodied.ts (arm locomotion)
│  │     ├─ render/        renderer + WebXR, ring/ (bend), cameras/, textures/, fx/
│  │     ├─ world/         scene builders from level data: shell, promenade, lots, lifts, hub, Depot
│  │     ├─ avatar/        robot model, procedural animation, hand IK, remote interpolation
│  │     ├─ items/         item visuals (sabers, blasters, carrots, cosmetics, decor)
│  │     ├─ shop/          shelves, price tags, register, store management UI (DOM + in-world)
│  │     ├─ ui/            HUD, menus, world code entry, link code, daily statement, wrist panel (VR)
│  │     ├─ net/           connection, interpolation buffer, clock sync
│  │     ├─ voice/         WebRTC mesh + spatial audio (later)
│  │     └─ audio/         hum, cha-ching, closing bell, ambience
│  └─ server/
│     └─ src/
│        ├─ index.ts       one process: serves the built client + Colyseus + SQLite
│        ├─ rooms/WorldRoom.ts
│        ├─ economy/       ledger, stores, demand sim, daily close, away catch-up
│        ├─ db/            schema, migrations, backups
│        └─ auth/          device tokens, link codes
├─ packages/
│  └─ shared/src/
│     ├─ constants.ts      habitat dimensions in meters
│     ├─ ring-space.ts     bend / unbend / wrap / frames
│     ├─ sim/              movement, collision, lifts, zero-g, crates, items
│     ├─ economy/          pure rules: rent, demand curve, prices, statements (no I/O)
│     ├─ content/          level data: lots, Depot catalog, crate stacks, spawn points
│     ├─ protocol/         messages, versioning, pose codecs
│     └─ rng.ts
└─ docs/
```

Where today's code goes:

| `index.html` section (lines) | New home |
| --- | --- |
| CSS + HUD markup (1-127) | `apps/client/index.html`, `ui/` |
| renderer / scene (140-150) | `render/renderer.ts` |
| habitat scale + bend (151-212) | `shared/constants.ts`, `shared/ring-space.ts`, `render/ring/` |
| procedural textures, materials (213-413) | `render/textures/`, `render/materials.ts` |
| robot (414-567) | `avatar/robot.ts` + `avatar/animate.ts` |
| habitat, shops, landmarks, end caps (568-1057) | `shared/content/` (lot and layout data) + `world/` (builders) |
| weapon table + items (1058-1168) | `shared/sim/items.ts` + `items/` |
| crates (1169-1200, 1706-1754) | `shared/sim/crates.ts` + `world/crates.ts` |
| particles (1201-1239) | `render/fx/` |
| input (1240-1295) | `input/devices/*`, `input/bindings/` |
| `update()` (1296-1705) | `shared/sim/movement.ts`, `controllers/piloted.ts`, `avatar/animate.ts`, `render/cameras/third-person.ts` |
| lifts, hub, `updateReal` (1769-1995) | `shared/sim/lifts.ts`, `shared/sim/zero-g.ts`, `world/lifts.ts` |

---

## 5. Controls by platform

### iPad (flat, first-class)

- **Movement and camera:** a floating left-thumb joystick replaces the d-pad. Dragging on the right half looks around, and pinch zooms.
- **Interacting:** tap an item, shelf slot, kiosk, or register to interact. Context buttons appear (Buy, Stock, Lease, Pick up).
- **Buttons:** large thumb buttons for jump and grab, inside the safe areas.
- **Panels:** store management opens as a full-screen sheet with prices, stock, upgrades, and the daily statement.
- **Other input:** a Magic Keyboard, trackpad, or gamepad switches automatically to that profile.

### MacBook (flat)

| Action | Input |
| --- | --- |
| Move | WASD / arrows (camera-relative by default, tank steering as an option) |
| Look / orbit | Two-finger drag or mouse drag; never requires right-click |
| Zoom | Pinch or scroll (Chrome sends pinch as `wheel` + `ctrlKey`; Safari sends `gesturechange`, so handle both) |
| Interact | Click the object, or E when the prompt shows |
| Jump / grab / use | Space / G / F, same as today |
| Gamepad | Left stick move, right stick look, A interact |

### Meta Quest (VR)

- **Session:** `immersive-vr` with `local-floor`, and `hand-tracking` as optional. The Enter VR button shows only when it's supported.
- **Rig placement:** the rig sits at the bend frame of the player's strip position, so "up" follows the floor around the ring. Room-scale motion is converted back to strip coordinates every tick.
- **Locomotion:**
  - **Arm locomotion** in the Gorilla Tag style. Hands are sphere colliders. Pushing a surface moves the body the opposite way, and releasing carries the hand's velocity forward (capped).
  - **The zero-g hub** uses the same mechanic with no gravity.
  - **Comfort options:** thumbstick smooth locomotion, snap turn, vignette, seated mode.
- **Shopping, natively:** grab goods off shelves, put stock on shelf slots (they snap in), set an item on the register to pay, and use a **wrist panel** for Bolts, inventory, and the daily statement.
- **Store management** on a wall panel in your store's back room (a canvas texture with pointer interaction).
- **Performance budget (Quest 2/3):**
  - Frame rate: 72-90 Hz, with fixed foveation
  - Draw calls: at most about 150
  - Triangles: at most about 500k
  - Lights: no shadow maps, a fixed light count (D9)
  - Glass: minimal transparent overdraw (hub and lift glass)
  - Verify the bend chunk under multiview

---

## 6. Hosting (simple, cheap, just works)

- **One process does everything:** the Node server serves the built client files, runs Colyseus, and writes SQLite to a persistent volume. That means one deploy, one URL, and HTTPS from the host. WebXR requires HTTPS.
- **What to look for in a host:**
  - WebSocket support
  - a **persistent disk/volume**
  - automatic HTTPS
  - deploy-on-push from GitHub
  - an **always-on** small instance

  Railway, Render, and Fly.io all fit, typically on their cheapest paid tier. Avoid free tiers that sleep: a cold start drops everyone's connection and takes ages to wake.
- **Backups:** a nightly copy of the SQLite file to cheap object storage, with Litestream for continuous backups if you want to go further. Losing their stores would be the worst bug for kids.
- **For the Quest:** bookmark the URL in Quest Browser. If the kids use parent-managed Meta accounts, make sure the Browser app is allowed.
- **Dev testing on devices:** `vite --host` with HTTPS for the iPad on the same Wi-Fi, and `adb reverse` for a Quest over USB.

---

## 7. Voice chat (later phase)

- **Peer-to-peer WebRTC mesh**, with signaling over the existing Colyseus room. With 10 players that's 9 outgoing Opus streams at about 32 kbps, roughly 0.3 Mbps up per player, which is fine.
- **Proximity audio:** each remote voice goes through a WebAudio `PannerNode` attached to that avatar's head, with distance falloff. Mute and push-to-talk toggles.
- **Connectivity:** public STUN only to start. Add a cheap managed TURN server only if a friend's network can't connect.
- **Gotchas to test:**
  - Chrome sometimes needs a remote WebRTC stream attached to a (muted) `<audio>` element before WebAudio receives sound.
  - iPad Safari requires the mic request to come from a tap.
  - Check for echo on Quest speakers.

---

## 8. Phases

Each phase ends with something playable and deployed. Sizes are relative (S/M/L).

```
P0 Groundwork ─► P1 Decompose ─► P2 Input + avatar ─► P3 Online foundation ─┬─► P4 Quest VR ──┐
                                                                            └─► P5 Economy v1 ┴─► P6 Economy v2 + social ─► P7 Later
```

P4 and P5 can go in either order. Do P5 first if the kids mostly play on iPad.

### P0: Groundwork (S)

- pnpm workspace, Vite, strict TypeScript, Biome, Vitest, Playwright.
- Replace the Unity `.gitignore` with a Node one.
- Move the current script into Vite **unchanged**. Add a deterministic mode (fixed clock, seeded `Math.random`) and Playwright screenshot baselines at MacBook and iPad viewports.
- CI: lint, typecheck, unit tests, build, screenshots. Preview deploys.
- *(Done ahead of time: rename to Saber Side.)*

**Exit:** identical game, built by Vite, deployed from CI.

### P1: Decompose and separate simulation from rendering (L)

- Extract modules per section 4 behind the screenshot tests (the strangler pattern: the game stays playable after every PR).
- `packages/shared`: meters (D3), `ring-space` (D4), level data with **lots defined as data**.
- The entity/world model (D2): player, crates, items, and lifts move out of meshes. Fixed tick and seeded RNG.
- Saber lighting moves to emissive + glow (D9).
- **Upgrade three.js** and re-verify the bend shader patches, color management, and light intensities.
- Unit tests for ring math, lifts, movement, and crates. The sim runs headless in Node.

**Exit:** gameplay is the same, and `shared/sim` runs in Vitest with no browser.

### P2: Input layer and the avatar model (M)

- Actions, device adapters, per-profile bindings, hot-swapping (D6).
- `PilotedController` extracted from `update()`. Camera-relative movement.
- The embodied avatar (D5) with procedural hands for flat players. Items are held in a hand.
- iPad touch rework (floating stick, tap-to-interact, context buttons) and MacBook trackpad polish.

**Exit:** single player feels great on iPad and MacBook.

### P3: Online foundation (M)

- `apps/server` as one process (static files + Colyseus + SQLite), deployed to the chosen host with backups.
- Profiles, device tokens, **link codes**, worlds with **world codes**, the owner panel skeleton.
- Presence for 10 players: pose streaming, interpolation, reconnection.
- Server-authoritative item pickup/drop, crates, and lifts.

**Exit:** friends on iPads and MacBooks hang out in a persistent world, and the world survives a server restart.

### P4: Meta Quest VR (L)

- XR session and rig in the bend frame, `playerScale`.
- `EmbodiedController`: arm locomotion on the floor and in zero-g, plus comfort options.
- Controller and hand-tracking input, haptics, wrist panel, in-world UI.
- Performance pass on a real Quest against the budget, with an on-device performance HUD.
- Tests: IWER (Meta's WebXR emulation runtime) in Playwright, plus a manual Quest checklist.

**Exit:** a Quest player and iPad players share a world, and the Quest player can climb, fling, float, and hand items to friends at a steady frame rate.

### P5: Economy v1 (L)

- Ledger, Bolts, starting balance, crate-bash payouts, daily allowance.
- Lots, the lease kiosk, the free first store, capex for additional stores.
- The Depot wholesaler, inventory, shelves, price tags, buying from player stores (flat UI first, VR interactions once P4 lands).
- Demand simulation with robot shoppers (sales events), the game clock, daily close with rent and utilities, the daily statement.
- Guardrails (no negative balances, closed for repairs, stock returned) and the economy config in the owner panel.
- Tests: ledger invariants (money in − money out = sum of balances), demand curve, daily close, away catch-up.

**Exit:** a kid can open a free store, stock it, earn from robot shoppers and friends, pay rent, and save up for a second store.

### P6: Economy v2 and social (M)

- Upgrades: shelf slots, sign, lighting, **clerk bots**, plus offline away-time trading and the "While you were away" summary.
- Visible robot shoppers on the promenade, store customization (name, sign, colors, layout).
- Direct player-to-player trades with a confirm step, and delivery-run odd jobs.
- **Proximity voice chat** (section 7).
- First mini-game: **Tag** (section 10).

**Exit:** the friend group plays together regularly with a living economy and voice.

### P7: Later

- Saber duels and combat, when you want fighting.
- More mini-games, crafting, more zones (end-cap observation decks, a hub market).
- glTF art pipeline alongside the procedural assets.

---

## 9. Unity or WebXR?

**Recommendation: stay on WebXR (three.js).** For a friend-group game across Quest + iPad + MacBook, the web wins on the things that matter most here.

| | WebXR (stay) | Unity (move) |
| --- | --- | --- |
| Getting it on devices | One URL. Bookmark it on the Quest and open it in Safari on the iPad. | Quest: sideload with developer mode (a Meta developer account on each headset) or submit to the Horizon Store. iPad: Xcode on the Mac, an Apple Developer membership ($99/yr), and TestFlight invites, with builds expiring every 90 days. |
| Shipping an update | Push to GitHub, and everyone has it on next load | Rebuild per platform and redistribute to every device |
| Existing code | Refactor what's here | Full rewrite: geometry, textures, the curved-floor shader, and gameplay are all rebuilt; only the design and numbers carry over |
| Quest performance | Good enough for this low-poly, blob-shadow style if we keep the budget | Better: native rendering, mature profiling tools |
| Physics, tools, assets | Hand-rolled physics, code-built content | PhysX, a visual editor, Asset Store, open-source Gorilla-style locomotion references |
| Multiplayer + voice | Colyseus + WebRTC (built by us) | Photon / Normcore with voice add-ons, with free tiers that cover a friend group. The economy still needs our own server. |
| Working with Claude Code | The whole loop (code, test in headless Chromium with XR emulation, deploy) runs in these sessions | Much of the work happens in the Unity editor on your Mac, and builds and on-device tests are manual |

**What moving to Unity would take:**

1. Unity 6 LTS (the free Personal license is fine), URP, and the Meta XR SDK (or OpenXR + XR Interaction Toolkit).
2. Rebuilding every scene and asset, and porting the bend shader (a "curved world" vertex shader in URP).
3. A netcode choice (Photon Fusion or Normcore), voice (Photon Voice or Vivox), and a separate economy backend.
4. Two distribution pipelines: Quest APK via developer mode or Horizon Store, and iPad via TestFlight.
5. Roughly the effort of P0-P5 again, before any new features.

**When Unity would be the right call:** you want a Horizon Store release, much richer graphics, physics-heavy play, or someone on the team who already knows Unity.

**The hedge:** the server and economy (D7, D8) are written in TypeScript on Colyseus, which has a Unity SDK. If the game outgrows the browser, a native Quest client could join the *same* worlds without throwing away the economy.

---

## 10. Modes

The **world itself is the game** (the economy). Modes are optional activities layered on top. None of them involve fighting.

| Mode | What it is | Who it's great for |
| --- | --- | --- |
| **Free roam** | What exists today: explore the ring, bash crates, ride lifts, float in the hub, play with items | Everyone, always on |
| **Market** | The persistent economy (section 3). Not a separate mode; it's the world. | The main loop |
| **Tag** | One player is "it", tagging means touching with a hand, everyone races around the promenade and hub. Arm locomotion makes it the classic VR chase; flat players play with stick + jump. | Quest kids especially |
| **Hub race** | Zero-g race through the lift tubes and hub rings, timed checkpoints | VR and flat |
| **Crate rush** | Timed crate bashing that pays a little in Bolts | Quick fun, a money source |
| **Delivery runs** | Carry orders between stores against a timer, paid by the store owner or an NPC | Ties into the economy |
| *Saber duels* | Deferred, since there's no fighting yet. Sabers are merchandise and toys meanwhile: ignite them, wave them, put on a light show. | Later |

---

## 11. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Shared sim + economy rules | Vitest (Node) | Ring math, movement, lifts, crates, rent, demand curve, daily close, away catch-up |
| Server | Vitest + bot clients | Ledger invariants, two kids buying the last item at once, lease races, reconnection, restart persistence |
| Input | Vitest | Bindings → actions, profile hot-swap, generated hand poses |
| Rendering | Playwright screenshots (deterministic mode) | MacBook and iPad viewports with touch emulation |
| VR | Playwright + IWER | Session start, rig placement, controller and hand input, shelf snapping |
| Devices | Manual checklist each release | iPad Safari, MacBook Safari/Chrome, Quest Browser |

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Losing world data (stores, Bolts) | Append-only ledger, a persistent volume, nightly backups, a tested restore |
| Economy balance (too easy, too punishing) | All numbers in config, the owner panel, guardrails, daily statements to spot problems |
| Three.js upgrade breaks the bend shader | Done in P1 behind screenshot tests; the patches live in one module |
| Quest performance (glass, overdraw, many items on shelves) | Budget in P4, instanced shelf items, no per-item lights, on-device performance HUD |
| VR comfort in a curved, rotating world | "Up" follows the local floor, comfort options, early playtests |
| Host sleeps or restarts mid-session | Always-on tier, Colyseus reconnection, state saved on every ledger write |
| Kids' Meta accounts block the Browser | Check the parent-managed account settings before P4 |
| The refactor stalls fun features | Strangler migration: playable and deployed after every PR |

---

## 13. Open questions

1. **Currency name:** "Bolts" (matches the crates)?
2. **Day length:** is 20 real minutes per game day right? Should the world freeze when nobody's online (recommended)?
3. **Launch goods:** sabers, blasters, carrots, robot cosmetics, decor. Anything the kids would definitely want to sell?
4. **Worlds:** one shared world for the whole friend group (recommended), or one per kid?
5. **Owner panel:** just you, or a parent in each family?
6. **Quest accounts:** are the kids on parent-managed Meta accounts, and is Quest Browser allowed?

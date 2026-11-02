# Saber Side: Refactor Game Plan

**Goal:** turn the single-file prototype (`index.html`, about 2,000 lines) into a codebase that can grow into a **persistent multiplayer shop-and-trade game for a group of friends**, playable on:

| Platform | Session | Input |
| --- | --- | --- |
| Meta Quest (Quest Browser) | WebXR `immersive-vr` | Touch controllers, hand tracking |
| iPad (Safari) | Flat browser, first-class | Touch, plus keyboard/trackpad or gamepad when connected |
| MacBook (Safari / Chrome) | Flat browser | Keyboard + trackpad/mouse, optional gamepad |

All three platforms play together in **one shared station**, with up to **10 players** online at once.

## Owner decisions

- **Platforms:** great flat play on iPad, **no AR**, VR on **Meta Quest**.
- **Name:** the game is **Saber Side** (formerly Rustball).
- **Engine:** **stay on WebXR** (three.js). See [section 9](#9-unity-or-webxr-decided-webxr) for the comparison.
- **Players:** 10 per room. **One shared world** for the whole friend group.
- **No fighting yet.** The core loop is **running shops and selling things to each other**. It's a fun economy with no real money. Shop owners earn a regular income and pay rent and other operating costs. New shops cost money to open, but the first one is free.
- **No free money.** Everyone **starts with nothing** and there's no allowance. Opening your (free) first shop starts a small, steady trickle of shards.
- **Currency (renamed 2026-11-01):** **Cyber Crystals**, "CC" for short, and **Cyber Shards** (100 shards = 1 CC), plus raw **Cyber Ore** that must be refined at the **Refinery Ring**: 1 ore chunk = 25 shards, less a 10% fee. (Earlier drafts said "Kyber".)
- **Pets:** up to **3 pet bots** at a time.
- **Clerk bots** keep a shop open for up to **8 hours** after the owner leaves. **A clerk is one of your own robots** put on duty (2026-11-01). Clerks earn **no wages** and cost nothing to run: the only cost is capex, buying the robot.
- **Internal only.** This is never published, so the Star Wars names are fine.
- **No day/night cycle.** It's space. The economy runs in **real time**.
- **Shops sell:** carrots, hats, **pet bots** (that follow on foot or fly overhead), and a **wide assortment of lightsabers and blasters**.
- **Modes:** **free roam first**.
- **No crate smashing.** The bashable crates on the promenade are gone. (Cargo crates still drift in the hub as scenery.)
- **Hosting:** cheap and simple, for kids rather than production grade, but it should just work.
- **Voice chat:** wanted, friends only, no moderation. Lower priority.
- **Owner panel:** just the owners.
- **Permissions:** **as light as possible.** No accounts, passwords, or roles for players, and every player can use every feature.
- **Players, robots, and guests (2026-11-01).** A **player** (the kid) is a unique username and a 4-digit PIN, and owns the wallet, shops, farms, and many **robots**. No emails or phone numbers. Kids come in as **guests** first: **Play** builds a robot with an auto-generated name, and nothing is saved. Guests can eat carrots and cure their paint. Registering at the **Robot Registry**, a free office next to the Bot Maker and the only place to register, saves their robot and cure and creates their Cyber Crystal wallet. Registered players log in with username and PIN, on the arrival screen or at the Registry. One seat per player: a second device takes over from the first. Existing robots are wiped. **The first robot is free, and extra robots cost CC** at the Bot Maker, **up to 5 per player** for now. The details and the PRs are in the initiative [Players, their robots, and seats](initiatives/players-and-robots.md).
- **Carrot-first economy, and paint that cures (2026-11-01).** A robot's paint is a see-through coat that cures 1 percentage point per carrot eaten, from 10% to the chosen color at full opacity. Robots eat through a jaw that opens on the panel seam below the eye. Economy v1 starts with carrots: carrot stands, the **Farmers** who sell carrots wholesale, and farms players can buy. The details and the PRs are in the initiative [Building the carrot and Cyber Crystal economy](initiatives/carrot-economy.md).
- **Robot parts catalogs (2026-11-01).** Robots are built from seven kinds of parts, each with its own catalog at the Bot Maker: **mobility** (the giant drive sphere today, tires later), **body coverings** (over the ball or the tires), **heads** (including a cute **jack-o-lantern**), **arms**, **voice** (voice boxes and microphones, for talking to other players), **eyes**, and **thrusters** (for moving in zero gravity). More parts, more colors, and everything costs Cyber Crystals. The details and the PRs are in the initiative [Robot parts catalogs](initiatives/robot-parts-catalog.md).
- **Mining Cyber Ore (2026-11-01).** Cyber Crystals are mined, like cryptocurrency (in spirit only: it's play money in the ledger). A registered player's wallet fills by mining **Cyber Ore** on a **distant planet** with an **ore hauler**, a vehicle that both mines the ore and flies it back to the **Refinery Ring**, a separate ring in space dedicated to refining ore into crystals. This is the second economic thread, next to carrots, and replaces the earlier ore drifting in the hub and the Refinery next to the Depot. The details and the PRs are in the initiative [Mining Cyber Ore and refining it into Cyber Crystals](initiatives/cyber-ore-mining.md).

## Initiatives

Work that takes a series of PRs gets its own doc in [`docs/initiatives/`](initiatives/): the decisions, the design, and the PRs with their status. This plan keeps the roadmap and links to each one.

| Initiative | Phase | Status |
| --- | --- | --- |
| [Players, their robots, and seats](initiatives/players-and-robots.md) | P3 | **Done** (#19, #20, #21, #22): guests, the Robot Registry, the wallet, and several robots per player |
| [Building the carrot and Cyber Crystal economy](initiatives/carrot-economy.md) | P5 (first slice) | In progress: step 0 (#13), the robot mouth (#27), paint cure (#28), and the first shop (#32) done, next `feature/carrot-farmers` |
| [Robot parts catalogs](initiatives/robot-parts-catalog.md) | P3 (parts), P5 (prices) | Planned: next `feature/jack-o-lantern-head`; prices wait on the players initiative and the wallet |
| [Mining Cyber Ore and refining it into Cyber Crystals](initiatives/cyber-ore-mining.md) | P5 | Planned: next `feature/ore-planet`; buying, mining, and refining wait on the wallet |
| [Playing Saber Side in VR on Meta Quest](initiatives/quest-vr.md) | P4 | In progress: entering VR done (#29), next `feature/vr-hands` |

---

## 1. What we have today

`index.html` is one IIFE with a single global mutable state, `st`. Good things to keep:

- **The ring-bend technique** (`index.html:161-199`). Floor content is simulated on a flat strip (x across, z around, y up) and bent onto the cylinder in the vertex shader. This keeps physics simple and works per eye in VR, because the bend happens in world space before `viewMatrix`.
- **Procedural shops already exist** (`buildShop`, `makeSign`, `index.html:675-809`). They become the rentable shop spots.
- **Procedural items:** `makeSaber(color)`, `makeBlaster()`, `makeCarrot()`. These become the generators for a wide, data-driven catalog.
- **Bashable crates and the zero-g hub.** The hub becomes a place to find **Cyber Ore**. *(Crate bashing was removed later, and ore moved to a distant planet; see Owner decisions.)*
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
| P6 | **One PointLight per saber** (`:1097`). | `makeSaber` | Shops will be full of sabers. Every light costs every lit pixel, and a changing light count forces shader recompiles. Quest frame rate would collapse. |
| P7 | **Units:** 1 scene unit = 0.364 m. | `FT` `:155` | WebXR works in meters. |
| P8 | **"Real space" via a height sentinel:** anything with y > 5000 is drawn unbent (`REAL_OFF`). | `:572` | An invisible coupling that should live behind one API. |
| P9 | **three.js r128 from a CDN** (2021). | `:128` | Hand tracking, foveation, and multiview need a current three.js. |
| P10 | **No build, types, tests, CI, or persistence.** The `.gitignore` is a Unity template. | repo root | A persistent economy needs a database and a safety net. |

---

## 2. Key decisions

### D1. Monorepo: TypeScript + Vite + pnpm workspaces

- `apps/client`: Vite, strict TypeScript, three.js pinned to an exact current release, `WebGLRenderer`.
- `apps/server`: Node + TypeScript + Colyseus + SQLite.
- `packages/shared`: pure TypeScript game rules, constants, ring math, economy rules, item catalog, and network protocol. No DOM and no scene graph (three's math classes are fine), so it runs in the browser, on the server, and in tests.
- Tooling: Biome (lint + format), Vitest, Playwright, GitHub Actions.

### D2. The simulation owns the state, rendering only reads it

- A fixed 60 Hz tick over plain data. Rendering interpolates between ticks.
- Entities are plain objects grouped by component, and systems are functions over them. Hand-rolled to start; a small ECS library only if needed later.
- The render layer maps `entityId → Object3D` and syncs every frame. Gameplay never touches meshes.
- A seeded RNG for anything that changes game state. Cosmetic effects use an injected RNG so tests can pin it.

### D3. Meters everywhere, player scale on the VR rig

- **1 unit = 1 meter.** Every constant is converted once (gravity of 28 u/s² is about 10.2 m/s², which checks out).
- The robot is 1.22 m tall. In VR, the rig scales headset eye height to robot eye height, using one `playerScale` setting.

### D4. All ring math lives in one module (`shared/ring-space.ts`)

- Every entity is in one of two frames: `strip` (floor, simulated flat, drawn bent) or `real` (lift tubes, hub, end caps).
- The module owns `bendPoint` / `unbend` / `wrapD`, frame conversions, and the GLSL chunk. `REAL_OFF` becomes a renderer detail.

### D5. One avatar format for every platform

Every avatar is networked as an **embodied pose**: root (frame + position + yaw), head, left hand, right hand, and per-hand state (gripping, holding item id). It also carries a **loadout**: equipped hat and up to 3 pet bots.

- **Quest players** fill the pose from the headset and controllers or hands.
- **iPad and MacBook players** drive the root with stick or keys, and an animation layer generates head and hand poses from what they're doing (carrying, waving, placing an item on a shelf).
- **Pet bots** aren't streamed. Each client runs the same follow behavior from the owner's pose and the pet's type, so they cost no bandwidth.
- Everyone renders the same way, so a VR kid handing a saber to an iPad kid looks right on both screens.

### D6. Controllers are separate from input devices

```
devices (keyboard, mouse/trackpad, touch, gamepad, xr-controller, xr-hand)
   → action map / pose stream   (per-profile bindings)
   → controller                 (PilotedController | EmbodiedController)
   → avatar intent              (written into the sim each tick)
```

Profiles hot-swap: a keyboard on the iPad hides the touch UI, a gamepad switches bindings, and entering VR swaps controllers without dropping the connection.

### D7. Multiplayer: clients own their bodies, the server owns the world and every shard

- **Movement is client-owned.** VR arm locomotion can't be predicted well by a server. Clients stream poses at about 30 Hz, and the server applies light sanity checks.
- **The server is authoritative** for item ownership, ore, lifts, shops, inventory, prices, and **every currency change**. Clients *request* ("buy item 812 for 3 CC 20 shards"), and the server validates, applies, and broadcasts the result.
- Remote avatars render about 100 ms behind, from an interpolation buffer.
- **Stack:** Node + **Colyseus** (rooms, reconnection, binary state sync) over WebSocket, which works everywhere including Quest Browser and Safari.

### D8. One persistent station, no accounts

- **One world** (Ring Seven) for the whole friend group, as a single Colyseus room capped at 10 online players. An 11th player sees "Station full, try again soon".
- **SQLite** on the server's disk stores the state. Ledger writes are saved immediately.
- **Identity with no accounts or passwords** ([initiative](initiatives/players-and-robots.md)):
  - **Guests:** open the URL and tap **Play** to build a robot and come aboard, with an auto-generated name. Nothing is saved: a reload, a long drop, or a server restart loses a guest.
  - **Registered players:** a guest registers at the **Robot Registry** (free, next to the Bot Maker) with a unique username and a 4-digit PIN. That saves their robot and creates their Cyber Crystal wallet. After that they log in with username and PIN on any device; the same login works on the Quest and the iPad, so there's nothing to link. The device remembers the username, never the PIN.
  - A **player** owns the wallet, shops, farms, and robots. A **robot** is parked, piloted, or on duty. A **seat** is one connection piloting at most one robot, and each player has at most one: coming aboard from a second device takes over from the first. Robots on duty don't take seats.
  - The tradeoff is a 4-digit PIN as the whole login, with lockouts that grow. That's fine for play money among friends, and an owner resets a forgotten PIN.
- **Owner panel** (owners only): unlocked on a device by entering an `ADMIN_KEY` that's set as a server environment variable. From the panel, owners can tune economy numbers, grant or remove currency, reset a shop, rename, reset the PIN of, or remove players and robots, and restock the Depot.
- **Browser permissions** are only requested when a feature needs one: the microphone only when someone turns voice on, and Quest's standard VR prompt only on Enter VR. No motion or camera permissions.

### D9. Lights budget: emissive, not lights

Sabers get emissive cores plus additive glow sprites, with **no light per saber**. That matters even more now that shops display many of them. If dynamic glow is wanted, use a fixed pool of 2-4 lights assigned to the nearest lit sabers.

---

## 3. The economy (core game loop)

### Loop

> Mine Cyber Ore (fly an ore hauler to a distant planet) → refine it into crystals at the Refinery Ring → open your free first shop → buy stock at the Depot → set prices and fill shelves → earn from robot shoppers and friends → pay rent and running costs → save up → open another shop or upgrade.

### Currency

| | What it is | Notes |
| --- | --- | --- |
| **Cyber Shards** | Small change | The base unit. The ledger stores every amount as an integer number of shards. |
| **Cyber Crystals (CC)** | Main money | **1 CC = 100 shards**, converted automatically. Displayed as `12 ◆ 45` (12 CC, 45 shards). |
| **Cyber Ore** | A raw resource, not money | A physical item you carry. It must be taken to the **Refinery Ring**, which turns it into crystals and keeps a fee. Ore can also be traded or sold between players. |

- **Every currency change is a ledger entry**: who, to whom, how many shards, why, and when. Balances are derived from the ledger. This rules out duplication bugs and makes shop reports trivial.
- **New players start with nothing.** There's no starter purse and no allowance.
- **The first shop pays a trickle:** an open shop earns a small, steady trickle of shards from window shoppers, scaled by foot traffic. For the free first shop, the trickle always pays more than its rent, so a brand-new player can afford their first stock after a short stretch of play. For extra shops, the trickle is less than the rent, so they need stock to make a profit.
- Money enters the world in only four ways:
  - the window-shopper trickle from open shops
  - robot (NPC) shoppers buying stock
  - refining ore
  - selling items back to the Depot below what they cost
- **Money leaves the world through:**
  - rent
  - utilities
  - Refinery fees
  - wholesale stock
  - shop build-outs and upgrades (capex)
  - robot parts and colors, and ore haulers

  Sales between players just move money from one player to another.

### Cyber Ore and the Refinery Ring

- **Where ore comes from:** glowing veins on a **distant ore planet**, drilled with an **ore hauler** that a registered player buys with Cyber Crystals. Veins are shared and regrow slowly, which caps how many crystals the station can mine in an hour.
- **The Refinery Ring** is a separate ring out in space, dedicated to refining. Dock the hauler, the hold empties into a hopper, and after a short refining animation crystals are paid out minus the fee. Rates live in config: **1 ore chunk → 25 shards, less a 10% fee**.
- The design and the PRs are in the initiative [Mining Cyber Ore and refining it into Cyber Crystals](initiatives/cyber-ore-mining.md).
- **Later:** let a player *buy* and run the Refinery as a business and set its fee.

### Shops

- Each shop slot on the promenade is a **spot** with a size (S/M/L) and a **foot-traffic score**. Spots near the lifts and the welcome arch get more traffic.
- **Rent per hour** = base × size × traffic. Busy spots earn more and cost more. That's the core decision.
- Vacant spots show a "FOR LEASE" sign. Walk up and lease from the kiosk.
- **First shop: free to open (no capex)**, and its window-shopper trickle always covers its rent. **Each additional shop costs capex**: a build-out fee scaled by size that rises with each shop you already own, so one kid can't buy the whole ring.
- **Upgrades are capex too:** more shelf slots, a better sign, display lighting (raises appeal). **Clerks** aren't an upgrade: any robot you own can be put on duty behind your counter, and buying that robot is the only cost.

### What shops sell (launch catalog)

All item types are **data-driven variants of procedural generators**, so "a wide assortment" is mostly a matter of adding catalog entries, not modeling art.

| Category | Variants | Notes |
| --- | --- | --- |
| **Lightsabers** | Hilt (several styles), blade color (about 10), blade type (single, double-bladed, crossguard, short "shoto", curved hilt), blade length, hum pitch | Extends `makeSaber`. Rarity tiers (Common → Legendary) set the wholesale price. Ignite and swing. No damage to players. |
| **Blasters** | Body (pistol, carbine, rifle), bolt color, fire rate, sound | Extends `makeBlaster`. Fires at targets. Bolts pass harmlessly through robots with a spark. |
| **Hats** | Caps, helmets, antennas, crowns, traffic cones, ... | Attach to the robot's head. Shown on remote players through the loadout (D5). |
| **Pet bots** | **Walkers** that roll or hop along behind you, and **flyers** (drones, orbs) that hover overhead | Follow behavior runs on each client (D5). **Up to 3 equipped at once**, in any mix. |
| **Carrots** | Regular, golden, giant | Biteable (existing). A cheap, fast-selling starter item. |

- **The Depot** is the NPC wholesaler in the hub, so riding the lifts matters. Its stock rotates, and rarer saber variants show up occasionally.
- **Stocking:** in VR you physically place items on shelf slots, where they snap into place. On flat devices you tap a slot, then pick from your inventory.
- **Buying:**
  - Flat: tap or click an item to see its price card, then Buy.
  - VR: grab it off the shelf (its tag glows "unpaid") and set it on the register pad, or press Buy on your wrist.
- **Later:** direct player-to-player trades with a confirm step, and crafting.

### Income from robot shoppers

- While a shop is **open**, the server simulates robot shoppers arriving in **real time**. The arrival rate is foot traffic × appeal × base rate. Each visitor buys with a probability that falls as price rises above the item's reference price.
- This is the **regular income**, and it rewards good spots, good stock, and fair prices.
- Some robot shoppers are visible, wandering the promenade and leaving shops carrying what they "bought". Clients render them from server events.

### Real time, no day cycle

- **A shop is open while its owner is on the station, or while a clerk bot is on shift.** A clerk keeps the shop open for up to 8 hours after the owner leaves (configurable).
- **Rent and utilities build up only while a shop is open**, so kids aren't charged while they're at school with no clerk.
- **Settlement:** robot sales, rent, and utilities are posted to the ledger every 5 real minutes as summarized entries. Sales between players post immediately.
- **Reports instead of daily statements:**
  - a **shift report** when you leave: sales, costs, profit
  - a **"While you were away"** summary when you return, if a clerk worked
  - a rolling **"last hour"** view in the shop panel
- The server runs all the time (section 6). After any downtime it simply resumes; it doesn't back-fill.

### Guardrails, with no allowance

- Balances can't go below zero. A shop that can't pay rent goes **"Closed for repairs"**: no sales, no rent. It reopens when you pay.
- After several hours closed and unpaid, the spot is returned to vacant, and its stock goes back to the owner's inventory. **Nothing is ever destroyed.**
- **Ways back from zero:** your first shop's trickle, mining and refining ore (once you own a hauler), and selling inventory back to the Depot or to friends.
- Every number (rent, trickle, demand, ore rates, Refinery fee, clerk shift) lives in one config file and can be tuned from the owner panel.

### Carrots, paint cure, and farms

Carrots come first: eating them cures a robot's paint, so everyone wants them. Any shop can be a carrot stand stocked from the **Farmers**, and a player with enough CC can buy a farm to grow their own. The design, the starting numbers, and the PRs are in the initiative [Building the carrot and Cyber Crystal economy](initiatives/carrot-economy.md).

### Data model (SQLite)

```
station(id, name, settings_json)                          -- one row: Ring Seven
players(id, display_name, pin_hash, created_at)          -- registered players only; guests aren't saved
robots(id, player_id, display_name, color, build_json, loadout_json, created_at, piloted_at, paint_cure)
spots(spot_id, size, traffic)                             -- seeded from shared/content
shops(id, spot_id, owner_id, name, sign_json, status, upgrades_json, clerk_robot_id, clerk_until, opened_at)
plots(plot_id, row_count)                                 -- farm plots, seeded from shared/content/farms.ts
farms(id, plot_id, owner_id, bought_at, grown_until, bin_qty)
owned_parts(player_id, slot, part_id, bought_at)          -- robot parts a player has bought; free parts aren't stored
owned_paints(player_id, paint, bought_at)
haulers(id, player_id, kind, bought_at)                   -- ore haulers
veins(vein_id, qty, grown_until)                          -- ore veins, seeded from shared/content/ore.ts
items(id, catalog_id, variant_json, qty, owner_id, location_kind, location_ref, price_shards)
ledger(id, ts, from_acct, to_acct, amount_shards, reason, ref)
```

Ore is a stackable item (`catalog_id = 'ore'`, in a pocket or a hauler's hold), and so are carrots (`catalog_id = 'carrot'`, in a pocket, on a shelf,
or in a farm's bin). A farm's growth is worked out from the time since `grown_until`, capped by the bin, and posted when
someone looks at the farm or at settlement, so no timer runs per farm. Accounts in the ledger are registered players (a wallet is created at the Robot Registry), shops, and
system sinks and sources (`depot`, `refinery`, `rent`, `npc_shoppers`, `farmers`, `seed`, `bot_maker`, `hangar`).

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
│  │     ├─ app/           loop (fixed tick + interp), states: boot/roster/play/vr, settings
│  │     ├─ platform/      profiles: desktop | touch | vr
│  │     ├─ input/         actions.ts, devices/*, bindings/*
│  │     ├─ controllers/   piloted.ts, embodied.ts (arm locomotion)
│  │     ├─ render/        renderer + WebXR, ring/ (bend), cameras/, textures/, fx/
│  │     ├─ world/         scene builders from level data: shell, promenade, spots, lifts, hub, Depot, Refinery Ring, ore planet
│  │     ├─ avatar/        robot model, hats, procedural animation, hand IK, remote interpolation
│  │     ├─ pets/          walker + flyer pet bots, follow behaviors
│  │     ├─ items/         item generators: sabers, blasters, carrots, hats, ore
│  │     ├─ shop/          shelves, price tags, register, shop management UI (DOM + in-world)
│  │     ├─ ui/            HUD (crystals/shards/ore), roster picker, shift reports, wrist panel (VR), owner panel
│  │     ├─ net/           connection, interpolation buffer, clock sync
│  │     ├─ voice/         WebRTC mesh + spatial audio (later)
│  │     └─ audio/         hum, blaster, cha-ching, Refinery, ambience
│  └─ server/
│     └─ src/
│        ├─ index.ts       one process: serves the built client + Colyseus + SQLite
│        ├─ rooms/StationRoom.ts
│        ├─ economy/       ledger, shops, demand sim, settlement, clerks, Refinery, Depot
│        ├─ db/            schema, migrations, backups
│        └─ admin/         ADMIN_KEY check, owner panel actions
├─ packages/
│  └─ shared/src/
│     ├─ constants.ts      habitat dimensions in meters
│     ├─ ring-space.ts     bend / unbend / wrap / frames
│     ├─ sim/              movement, collision, lifts, zero-g, items, ore
│     ├─ economy/          pure rules: currency math, rent, demand curve, Refinery yield (no I/O)
│     ├─ catalog/          item catalog: saber/blaster/hat/pet/carrot variants, rarity, prices
│     ├─ content/          level data: spots, ore spawns, spawn points
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
| habitat, shops, landmarks, end caps (568-1057) | `shared/content/` (spot and layout data) + `world/` (builders) |
| weapon table + items (1058-1168) | `shared/sim/items.ts`, `shared/catalog/`, `items/` |
| crates (1169-1200, 1706-1754) | *(removed: no crate smashing)* |
| particles (1201-1239) | `render/fx/` |
| input (1240-1295) | `input/devices/*`, `input/bindings/` |
| `update()` (1296-1705) | `shared/sim/movement.ts`, `controllers/piloted.ts`, `avatar/animate.ts`, `render/cameras/third-person.ts` |
| lifts, hub, `updateReal` (1769-1995) | `shared/sim/lifts.ts`, `shared/sim/zero-g.ts`, `world/lifts.ts` |

---

## 5. Controls by platform

### iPad (flat, first-class)

- **Movement and camera:** a floating left-thumb joystick replaces the d-pad. Dragging on the right half looks around, and pinch zooms.
- **Interacting:** tap an item, shelf slot, kiosk, register, or Refinery hopper to interact. Context buttons appear (Buy, Stock, Lease, Pick up, Refine).
- **Buttons:** large thumb buttons for jump, grab, and use (ignite or fire), inside the safe areas.
- **Panels:** shop management opens as a full-screen sheet with prices, stock, upgrades, and reports.
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
  - **The zero-g hub** uses the same mechanic with no gravity, and thrusters (a robot part) make flying it fun.
  - **Comfort options:** thumbstick smooth locomotion, snap turn, vignette, seated mode.
- **Shopping, natively:** grab goods off shelves, put stock on shelf slots (they snap in), set an item on the register to pay, toss ore into the Refinery hopper, and use a **wrist panel** for crystals, shards, ore, and inventory.
- **Shop management** on a wall panel in your shop's back room (a canvas texture with pointer interaction).
- **Performance budget (Quest 2/3):**
  - Frame rate: 72-90 Hz, with fixed foveation
  - Draw calls: at most about 150, with shelf items **instanced** per variant
  - Triangles: at most about 500k
  - Lights: no shadow maps, a fixed light count (D9)
  - Glass: minimal transparent overdraw (hub and lift glass)
  - Verify the bend chunk under multiview

---

## 6. Hosting (simple, cheap, just works)

> **Decision (2026-11-01): everything is hosted on Render.** The game moved from Netlify to a free Render static site in the same `render.yaml`, after Netlify paused production deploys when the team ran out of credits: the live game fell behind the station, which turned every join away as outdated. One host and one Blueprint, with every service deploying from the same merge after CI, so nothing depends on Netlify's credits. PR previews are Render static-site previews that join staging. [HOSTING.md](HOSTING.md) has the setup.
>
> **Superseded decision (2026-10-31): the client is hosted on Netlify** (the owner already has an account), using `netlify.toml` in the repo. Netlify can't run a long-lived WebSocket server or keep a disk, so from Phase 3 the game server runs on a separate always-on host (a Render web service with a persistent disk is the front-runner). The client connects to it over `wss://`. That replaces the "one process does everything" layout below: the server only runs Colyseus, the economy, and SQLite.
>
> **Decision (2026-10-31): the server runs on Render**, from `render.yaml`: a Starter instance with a 1 GB disk for the real station, plus a free staging service that PR previews join, so a PR never touches real data. Render deploys only after CI passes, and only when server or shared code changed. Splitting the hosts means the client and server can briefly run different versions after a merge, so every join carries `PROTOCOL_VERSION` and a mismatched page offers a reload. Setup steps and deploy behavior are in [HOSTING.md](HOSTING.md).

- **One process does everything:** the Node server serves the built client files, runs Colyseus, runs the economy, and writes SQLite to a persistent volume. That means one deploy, one URL, and HTTPS from the host. WebXR requires HTTPS.
- **What to look for in a host:**
  - WebSocket support
  - a **persistent disk/volume**
  - automatic HTTPS
  - deploy-on-push from GitHub
  - an **always-on** small instance, since clerk shops trade in real time

  Railway, Render, and Fly.io all fit, typically on their cheapest paid tier. Avoid free tiers that sleep.
- **Backups:** a nightly copy of the SQLite file to cheap object storage. Losing the kids' shops would be the worst bug.
- **For the Quest:** bookmark the URL in Quest Browser.
- **Dev testing on devices:** `vite --host` with HTTPS for the iPad on the same Wi-Fi, and `adb reverse` for a Quest over USB.

---

## 7. Voice chat (later phase)

- **Peer-to-peer WebRTC mesh**, with signaling over the existing Colyseus room. With 10 players that's 9 outgoing Opus streams at about 32 kbps, roughly 0.3 Mbps up per player, which is fine.
- **Proximity audio:** each remote voice goes through a WebAudio `PannerNode` attached to that avatar's head, with distance falloff. Mute and push-to-talk toggles.
- **Off by default.** The mic permission is requested only when a player taps "Voice on".
- **Connectivity:** public STUN only to start. Add a cheap managed TURN server only if a friend's network can't connect.
- **Gotchas to test:**
  - Chrome sometimes needs a remote WebRTC stream attached to a (muted) `<audio>` element before WebAudio receives sound.
  - iPad Safari requires the mic request to come from a tap.
  - Check for echo on Quest speakers.

---

## 8. Phases

Each phase ends with something playable and deployed. Sizes are relative (S/M/L).

```
P0 Groundwork ─► P1 Decompose ─► P2 Input + avatar ─► P3 Online free roam ─┬─► P4 Quest VR ──┐
                                                                           └─► P5 Economy v1 ┴─► P6 Economy v2 + social ─► P7 Later
```

**Free roam comes first**: P3 delivers it online for everyone. P4 and P5 can go in either order; do P5 first if the kids mostly play on iPad.

### Where we are (2026-11-01)

| Phase | Status | Done | Still to do |
| --- | --- | --- | --- |
| P0 Groundwork | **Done** | Everything | |
| P1 Decompose | **Partly done** | `packages/shared` and its tests, ships and planets on the new layout, render modules, the robot factory, seeded cosmetic RNG | Meters (units are still feet-scaled, `FT`), the entity/world model (the player, items, and lifts still live on meshes), a fixed tick, emissive sabers (each saber still has a point light), the three.js upgrade (still r128), and most of `game.js` (1,661 lines, `update()` included) |
| P2 Input + avatar | Not started | | Action map and device adapters, `PilotedController`, the embodied avatar, the iPad touch rework (including the legend/d-pad overlap) |
| P3 Online free roam | **Partly done** | The station server on Render, the owner panel, robots built from parts, the Bot Maker spawn, seeing friends' robots, and [players, their robots, and seats](initiatives/players-and-robots.md): guests, the Robot Registry, logins with PINs, one seat per player, up to 5 robots each | Server-authoritative item pickup/drop and lifts (sabers and blasters as shared toys); off-site backups (Litestream) |
| P4 Quest VR | **Started** | Entering VR on a Quest, first person on the ring, stick driving and snap turn (the [Quest VR initiative](initiatives/quest-vr.md), #29) | Hands, the wrist panel, lifts and the hub, arm locomotion, the performance pass |
| P5 Economy v1 | **Started** | Step 0, the robot mouth, paint cure, and the first shop of the [carrot initiative](initiatives/carrot-economy.md) (#13, #27, #28, #32), and the Cyber Crystal wallet (#21) | The rest of the carrot initiative, then the rest of P5 |
| P6, P7 | Not started | | |

P5 is going ahead of P2-P4 on purpose: the carrot initiative is the next feature work. Its PRs build in modules, the way `app/flight.ts` did, so they don't wait on the rest of P1.

### P0: Groundwork (S): done

- [x] pnpm workspace (`apps/*`, `packages/*`), Vite 8, strict TypeScript, Biome, Playwright.
- [x] Node `.gitignore` replaces the Unity one.
- [x] The game moved into `apps/client` with its script **unchanged** in `src/legacy/game.js` (three.js r128 now from npm, fonts bundled instead of Google Fonts). The only addition is a `?debug` hook that exposes state to tests.
- [x] Deterministic Playwright tests:
  - **Determinism:** the fake clock is paused, `Math.random` is seeded, and a test asserts that two identical runs produce identical state.
  - **Screenshot baselines:** MacBook and iPad (touch) views.
  - **Smoke test:** every key action runs without errors.
  - **Speed:** software WebGL is slow, so draw calls are skipped except on the captured frame.
- [x] CI: lint, typecheck, unit tests, build, e2e. Reports are uploaded when it fails.
- [x] `pnpm dev:https` for testing on an iPad or Quest on the same network.
- [x] *(Ahead of time: rename to Saber Side.)*
- Deferred: **Vitest** arrives with `packages/shared` in P1, since there's nothing to unit test until then. **Preview deploys** wait for the hosting choice in P3.
- Found for P2: on iPad landscape, the keyboard legend overlaps the touch d-pad.

**Exit:** identical game, built by Vite, checked by CI.

### P1: Decompose and separate simulation from rendering (L)

**Progress:**

- [x] `packages/shared` created with Vitest. Ring geometry, `bendPoint` / `bendUp` / `unbend` / `wrapD`, the spin rate, `mulberry`, and `clamp` / `lerp` / `damp` / `smooth` moved out of the legacy file, with 13 unit tests. The screenshot baselines are unchanged.
- [x] First feature built on the new layout instead of in the legacy file: **ships and planets** (board a ship in the hub, launch through an airlock, fly to four planets, zap aliens, dock back at the ring). The rules are plain data and functions in `shared/sim/` (`flight`, `ship`, `lasers`, `aliens`) and `shared/content/space.ts`, unit-tested headless with a seeded RNG. The client builds scenes in `world/` and `render/`, and `app/flight.ts` maps input to the sim and the sim onto scenes, camera, and HUD. The legacy file only lends a few helpers and hands off to the flight mode.
- [x] The renderer, the ring-bend shader patch, and the procedural textures moved out of the legacy file into `render/renderer.ts`, `render/ring/bend.ts`, and `render/textures.ts` (typed, unchanged otherwise). The legacy file still calls them in the same places, so every random draw and object creation happens in the same order: rendered frames are byte-identical to before.
- [x] The robot is built by `avatar/robot.ts` (`buildRobot`) instead of a one-off block that filled the global `bot`, so the game can build more robots (remote players, P3). The materials and helpers come in through a kit, and the point light in the eye is optional, since one per robot would be costly. Frames are byte-identical. Driving a robot from state rather than from the local player's `st` is next.
- [x] Cosmetic randomness has its own seeded RNG (D2). three r128 draws every object's UUID from `Math.random`, so when the legacy effects (robot glances, dust, sparks) and the flight effects shared it, adding or removing any scene object, or fonts loading a moment sooner on one machine, moved them, and screenshots broke between PRs and between a laptop and CI. Now adding objects leaves every screenshot unchanged.


- Extract modules per section 4 behind the screenshot tests (the strangler pattern: the game stays playable after every PR).
- `packages/shared`: meters (D3), `ring-space` (D4), level data with **spots defined as data**.
- The entity/world model (D2): player, items, and lifts move out of meshes. Fixed tick and seeded RNG.
- Saber lighting moves to emissive + glow (D9).
- **Upgrade three.js** and re-verify the bend shader patches, color management, and light intensities.
- Unit tests for ring math, lifts, movement, and items. The sim runs headless in Node.

**Exit:** gameplay is the same, and `shared/sim` runs in Vitest with no browser.

### P2: Input layer and the avatar model (M)

- Actions, device adapters, per-profile bindings, hot-swapping (D6).
- `PilotedController` extracted from `update()`. Camera-relative movement.
- The embodied avatar (D5) with procedural hands for flat players. Items are held in a hand. A hat slot.
- iPad touch rework (floating stick, tap-to-interact, context buttons) and MacBook trackpad polish.

**Exit:** single-player free roam feels great on iPad and MacBook.

### P3: Online free roam (M)

**Progress:**

- [x] `apps/server`: one Node process running Colyseus and SQLite (`node:sqlite`, so no native modules), with no build step because Node runs the TypeScript directly. The server creates one `station` room at boot and never disposes it; clients `join` rather than `joinOrCreate`, so an 11th player is told the station is full instead of getting a second, empty one. It also has numbered migrations, a `/healthz` check, a protocol version check on join, origin allow-listing, and a "restarting" notice on shutdown. Render and Netlify are configured, and server tests boot the real process (full station, outdated client, restart persistence, origins). The client shows a station status line and rejoins after drops and restarts.
- [x] The roster (D8): **Who's playing?** on arrival. Pick a robot or make one (name, paint color, optional 4-digit PIN, hashed with scrypt and locked for a minute after 5 wrong tries). Each device remembers its last robot (never the PIN). One robot has one body: coming aboard from a second device takes over from the first, and a reloaded page takes over its old held seat. The robot is painted its color. The owner panel skeleton (`ADMIN_KEY`) renames robots, clears forgotten PINs, and removes robots (kicking them if they're aboard). `PROTOCOL_VERSION` is now 2.
- [x] **Build a robot from parts.** A new robot is chosen part by part, in four slots: **mobility** (just the single wheel for now, and the only slot a robot needs to play), **body** (rust ball, barrel, crate), **head** (big eye, visor, stalk eye), and **arms** (grabbers, pincers, noodles). Each part has its own paint, or keeps its original skin. A turntable beside the picker shows the robot as it's built, drawn with the game's own kit. The parts catalog and build rules live in `shared/content/robot-parts.ts`; the client draws each part in `avatar/parts/`, and `buildRobot` assembles every robot from them, the classic one included (its frames are byte-identical). The roster stores each robot's build (migration 3, `build_json`); robots made earlier get the classic build in their old color. Coming aboard **spawns** the robot: it's rebuilt from its parts and rolls itself out of the **Bot Maker**, a workshop on the start plaza, through its bay door into the walkway (`shared/content/spawn.ts`, `world/bot-maker.ts`). The Bot Maker's walls are solid and its door stays open, so robots can drive back in. The station shares each player's build, and other players' robots are drawn from their parts (`app/presence.ts`). `PROTOCOL_VERSION` is now 4.
- [x] **Switch robots at the Bot Maker.** Driving back in through the Bot Maker's door opens **Who's playing?**, to pick another robot or build a new one, which then rolls out of the Bot Maker like any new robot. It opens once per visit: the robot has to leave the shop before it opens again, so a robot that just spawned inside, or whose player chose "Just look around", isn't asked again on the spot (`insideBotMaker` in `shared/content/spawn.ts`, `app/switch-robot.ts`). This replaces the status line's Switch button, which never worked: the line was rebuilt on every station state patch, many times a second, so the button was replaced between press and release. The line now only rebuilds when what it says changes.
- [x] **Crate smashing removed** (owner decision). The crates on the promenade, spin and blaster hits on them, the "crates bashed" tally, and restacking are gone. R and the HUD button kept just putting the items back, until that was removed too. The cargo crates drifting in the hub stay as scenery.

- `apps/server` as one process (Colyseus + SQLite; a Render static site serves the game), deployed to Render with backups.
- One station room capped at 10 players, the roster picker (name + color, optional PIN), and the `ADMIN_KEY` owner panel skeleton.
- Presence: pose streaming, interpolation, reconnection.
- Server-authoritative item pickup/drop and lifts. Sabers and blasters as shared toys.

**Exit:** friends on iPads and MacBooks free-roam together in the persistent station, and it survives a server restart.

### P4: Meta Quest VR (L)

P4 is the initiative [Playing Saber Side in VR on Meta Quest](initiatives/quest-vr.md). Its PR table is the source of truth for the order and status, and it's also the guide to trying VR on a headset.

- XR session and rig in the bend frame, `playerScale`.
- `EmbodiedController`: arm locomotion on the floor and in zero-g, plus comfort options.
- Controller and hand-tracking input, haptics, wrist panel, in-world UI.
- Performance pass on a real Quest against the budget, with an on-device performance HUD.
- Tests: IWER (Meta's WebXR emulation runtime) in Playwright, plus a manual Quest checklist.

**Exit:** a Quest player free-roams with iPad players, climbing, flinging, floating, and handing items around at a steady frame rate.

### P5: Economy v1 (L)

P5 starts with the initiative [Building the carrot and Cyber Crystal economy](initiatives/carrot-economy.md), a series of PRs that build the wallet, the first shop, the Farmers, carrot stands, and farms, with carrots as the only goods. Its PR table is the source of truth for that slice's order and status. The rest of P5 then builds on the same ledger, shops, and inventory:

- **Cyber Ore**: mining on a distant planet with an ore hauler, and the **Refinery Ring** with its fee, in the initiative [Mining Cyber Ore and refining it into Cyber Crystals](initiatives/cyber-ore-mining.md).
- **Robot parts for Cyber Crystals**: the Bot Maker's catalogs, in the initiative [Robot parts catalogs](initiatives/robot-parts-catalog.md).
- Capex for additional shops.
- The item catalog and generators: a wide saber and blaster assortment, hats, golden and giant carrots, and **pet bots** (walkers + flyers, up to 3 equipped through the loadout).
- The Depot (wholesale and buyback), and shelves and buying for every item, not just carrots (flat UI first, VR interactions once P4 lands).
- Guardrails (stock returned when a spot is reclaimed) and economy tuning in the owner panel for every item.
- Tests: currency math, Refinery yield, settlement, and two kids buying the last item at once, for every item.

**Exit:** a kid starting with nothing can open a free shop, earn its trickle, refine ore, stock it with sabers and pets, earn from robot shoppers and friends, pay rent, and save up for a second shop.

### P6: Economy v2 and social (M)

- Upgrades: shelf slots, sign, lighting. **Clerk bots** (your own robots on duty, no wages) with the "While you were away" summary.
- Visible robot shoppers on the promenade, shop customization (name, sign, colors, layout).
- Rotating Depot stock with rare saber drops, and direct player-to-player trades with a confirm step.
- **Proximity voice chat** (section 7).
- First extra mode: **Tag** (section 10).

**Exit:** the friend group plays together regularly with a living economy and voice.

### P7: Later

- A player-run Refinery, crafting, more zones (end-cap observation decks, a hub market).
- More modes (hub race, delivery runs).
- Saber duels, when you want fighting.
- A glTF art pipeline alongside the procedural assets.

---

## 9. Unity or WebXR? (Decided: WebXR)

Kept for the record:

| | WebXR (chosen) | Unity |
| --- | --- | --- |
| Getting it on devices | One URL. Bookmark it on the Quest and open it in Safari on the iPad. | Quest: developer-mode sideloading or a Horizon Store submission. iPad: Xcode, an Apple Developer membership ($99/yr), and TestFlight with builds expiring every 90 days. |
| Shipping an update | Push to GitHub, and everyone has it on next load | Rebuild per platform and redistribute to every device |
| Existing code | Refactor what's here | Full rewrite |
| Quest performance | Good enough for this low-poly style within budget | Better |
| Working with Claude Code | The whole loop (code, test, deploy) runs in these sessions | Much of the work happens in the Unity editor, and builds are manual |

Revisit only for a Horizon Store release or much richer graphics. Colyseus has a Unity SDK, so a native client could join the same station later.

---

## 10. Modes

The **station itself is the game** (free roam plus the economy). Other modes come later, and none involve fighting.

| Mode | What it is | When |
| --- | --- | --- |
| **Free roam** | Explore the ring, ride lifts, float in the hub, play with sabers and blasters | **First** (P3) |
| **Market** | The persistent economy (section 3). Not a separate mode; it's the world. | P5 |
| **Tag** | One player is "it", tagging means touching with a hand, everyone races around the promenade and hub | P6 |
| **Hub race** | Zero-g race through the lift tubes and hub rings | P7 |
| **Delivery runs** | Carry orders between shops against a timer | P7 |
| *Saber duels* | Deferred, since there's no fighting yet | Later |

---

## 11. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Shared sim + economy rules | Vitest (Node) | Ring math, movement, lifts, items, currency math, rent, demand curve, Refinery yield, settlement, paint cure, eating timeline, farm growth |
| Server | Vitest + bot clients | Ledger invariants, last-item races, lease races, reconnection, restart persistence, 10-player cap |
| Catalog | Vitest + Playwright screenshots | Every catalog variant builds, and a screenshot sheet of all sabers, blasters, hats, pets, and robot parts |
| Input | Vitest | Bindings → actions, profile hot-swap, generated hand poses |
| Rendering | Playwright screenshots (deterministic mode) | MacBook and iPad viewports with touch emulation |
| VR | Playwright + IWER | Session start, rig placement, controller and hand input, shelf snapping, Refinery hopper |
| Devices | Manual checklist each release | iPad Safari, MacBook Safari/Chrome, Quest Browser |

---

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| Losing station data (shops, crystals) | Append-only ledger, a persistent volume, nightly backups, a tested restore |
| Economy balance (too easy, too punishing) with no allowance | All numbers in config, the owner panel, ore and Depot buyback as ways back from zero, shift reports to spot problems |
| A kid logs in as another kid and spends their crystals | A required PIN per player with growing lockouts, and the owner panel can reverse ledger entries |
| Three.js upgrade breaks the bend shader | Done in P1 behind screenshot tests; the patches live in one module |
| Quest performance (glass, overdraw, full shelves, pets) | Budget in P4, instanced shelf items, no per-item lights, simple pet meshes, on-device performance HUD |
| VR comfort in a curved, rotating world | "Up" follows the local floor, comfort options, early playtests |
| Host restarts mid-session | Always-on tier, Colyseus reconnection, ledger written on every change |
| The refactor stalls fun features | Strangler migration: playable and deployed after every PR |

---

## 13. Open questions

None right now. All answers so far are recorded under [Owner decisions](#owner-decisions), and each initiative keeps its own open questions.

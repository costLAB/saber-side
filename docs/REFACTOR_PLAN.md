# Saber Side: Refactor Game Plan

**Goal:** turn the single-file Rustball prototype (`index.html`, about 2,000 lines) into a codebase that can grow. It needs to support four ways to play in one shared multiplayer world:

| Platform | Session | Primary input |
| --- | --- | --- |
| MacBook (Safari / Chrome / Firefox) | Flat browser | Keyboard + trackpad/mouse, optional gamepad |
| iPad (Safari) | Flat browser, plus an XR path (see [iPad XR reality check](#ipad-xr-reality-check)) | Touch, optional gyro, Pencil, keyboard, gamepad |
| VR headsets (Quest browser, Vision Pro Safari) | WebXR `immersive-vr` | Tracked controllers, hand tracking, gaze-and-pinch |
| Everyone | Multiplayer rooms | Each player uses whichever input they have |

This plan is ordered so that the decisions that are expensive to undo come first: separating simulation from rendering, the avatar data model, and the network authority model. Visible features come after.

---

## 1. What we have today

`index.html` is one IIFE with a single global mutable state, `st`. Good things to keep:

- **The ring-bend technique** (`index.html:161-199`). Floor content is simulated on a flat strip (x across, z around, y up) and bent onto the cylinder in the vertex shader. This keeps physics simple and works per eye in XR, because the bend happens in world space before `viewMatrix`. It is the core technical asset, so we keep it and formalize it.
- **Abstract actions already exist.** Input fills `keys` / `pressed` with action names (`up`, `jump`, `grab`, `use`, ...) instead of key codes (`index.html:1241-1252`), and a touch pad already feeds the same map. This is the starting point for a real input layer.
- **Blob shadows instead of shadow maps** (`index.html:1019`). This is already the right call for Quest performance.
- **Instanced and batched static parts** (`part` / `flushParts`), procedural canvas textures, particle pools.

Problems that block scale, XR, or multiplayer:

| # | Problem | Where | Why it matters |
| --- | --- | --- | --- |
| P1 | **The scene graph is the simulation state.** `bot.root.position` is the player's authoritative position, and crates and items store state on their meshes. | `update()` `index.html:1412+`, `updateCrates`, `updateItems` | You can't run the simulation headless on a server or in tests, and you can't have N players without N copies of the Three.js graph. |
| P2 | **One player, hard-wired.** `bot`, `st`, `held`, `cam`, and `camPos` are singletons. | throughout | Multiplayer needs N avatars, of which one is local. |
| P3 | **Simulation, input, animation, camera, and FX are interleaved in one 300-line `update()`.** | `index.html:1412-1705` | You can't swap in a different controller (VR) or camera (XR rig). |
| P4 | **Variable timestep:** `dt = min(getDelta, 1/30)`. | `frame()` `index.html:1757` | Network reconciliation and reproducible tests need a fixed tick. |
| P5 | **25 `Math.random()` calls, mixing cosmetic and gameplay randomness.** Crate knockback (`:1485-1487`) and item tumble (`:1155`) change game state. | throughout | Clients will disagree about crate positions. |
| P6 | **One PointLight per saber** (`:1097`), plus the eye light and axis light. | `makeSaber` | In three.js, the light count is part of the shader program key, and every lit fragment pays for every light. Twenty sabers in a room would mean 20 lights, shader recompiles, and a Quest frame-rate collapse. |
| P7 | **Units:** 1 scene unit = 1.19 ft (0.364 m), so the 4 ft robot is 3.35 units tall. | `FT` `index.html:155` | WebXR reference spaces are in meters. A mismatched scale breaks hand sizes, saber length, and comfort. |
| P8 | **"Real space" via a height sentinel:** anything with y > 5000 is drawn unbent (`REAL_OFF`). | `:572`, bend GLSL | It works, but it's an invisible coupling. It needs to live behind one API. |
| P9 | **Three.js r128 from a CDN** (2021). | `<script>` `:128` | Modern WebXR features (hand models, layers, foveation, multiview, `transient-pointer`) need a current three.js. Color and lighting APIs changed in r152 and r155. |
| P10 | **No build, types, tests, or CI.** The `.gitignore` is a Unity template for a project that isn't Unity. | repo root | Several people can't work on it safely. |

---

## 2. Key decisions

These are recommendations. Each one is cheap to change now and expensive later.

### D1. Monorepo: TypeScript + Vite + pnpm workspaces

- `apps/client`: Vite, TypeScript (strict), three.js pinned to an exact current release.
- `apps/server`: Node + TypeScript.
- `packages/shared`: pure TypeScript simulation, constants, ring math, and network protocol. It must not import the DOM or the three.js scene graph (three's *math* classes are fine) so it runs in the browser, on the server, and in tests.
- Tooling: Biome (lint + format), Vitest, Playwright, GitHub Actions.
- Stay on `WebGLRenderer`. WebXR support under `WebGPURenderer` is still not something to bet on.

### D2. The simulation owns the state, rendering only reads it

- A fixed-tick simulation (60 Hz) over plain data. Rendering interpolates between the last two ticks.
- Entities are plain objects grouped by component (`transform`, `body`, `holdable`, `crate`, `avatar`, ...), and systems are functions over them. Start with hand-rolled structures. A small ECS such as miniplex or koota can come later if the entity count demands it, since the data shape won't change.
- The render layer keeps a `Map<entityId, Object3D>` and syncs it each frame. Gameplay never touches meshes.
- **Randomness:** a seeded RNG for anything that affects state (`sim.rng`). Cosmetic FX may use any RNG, but it is injected so tests can pin it.

### D3. Meters everywhere, player scale on the rig

- Canonical unit: **1 unit = 1 meter**. `FT` becomes `0.3048`, and every constant is converted once (gravity of 28 u/s² is about 10.2 m/s², which checks out).
- The robot is 1.22 m tall. In VR, the XR rig is scaled so the headset's eye height maps to the robot's eye height, which gives a slightly smaller-than-life, Gorilla Tag-like scale that feels intentional. The scale is a single `playerScale` setting.
- Saber blade length (currently 1.3 units = 0.47 m) gets re-tuned against that scale so it reads as a real saber in VR.

### D4. Formalize ring space in one module (`shared/ring-space.ts`)

- Every entity is in one of two frames: `strip` (floor-bound, simulated flat, rendered bent) or `real` (tubes, hub, end caps, simulated in true 3D).
- The module owns `bendPoint`, `bendUp`, `unbend`, `wrapD`, frame conversions, and the GLSL chunk. The `REAL_OFF` sentinel becomes an implementation detail of the renderer, behind `RingSpace.attach(object, frame)`.
- The network sends frame-tagged positions, and each client converts. A player riding a lift switches frames at a defined tick, just as `boardLift` / `landLift` do now.

### D5. One avatar format for every platform

This decision makes cross-play work. **Every avatar is networked as an embodied pose:** root (frame + position + yaw), head pose, left and right hand poses, and per-hand state (grip, holding entity id, trigger).

- **VR players** fill it directly from the headset and controllers or hands.
- **Flat players** (MacBook, iPad) drive the root with sticks or keys, and an animation layer *synthesizes* head and hand poses from actions: swing arcs, a carry pose, the spin attack.
- Remote players render the same way whatever device they're on. A VR player and a MacBook player see each other's sabers in the same place.

### D6. Controllers are separate from input devices

```
devices (keyboard, mouse, touch, gamepad, xr-controller, xr-hand, transient-pointer)
   → action map / pose stream   (per-profile bindings, rebindable)
   → controller                 (PilotedController | EmbodiedController | SpectatorController)
   → avatar intent              (written into the sim each tick)
```

- `PilotedController` is today's behavior: tank or camera-relative rolling, jump, spin, and grab, with a third-person camera.
- `EmbodiedController` is VR: head tracking, hand colliders, Gorilla-style arm locomotion, and direct-grab items.
- Profiles hot-swap. Pressing a key on an iPad hides the touch UI (the current code already does this), connecting a gamepad switches bindings, and entering VR swaps controllers *without* dropping the network connection.

### D7. Multiplayer: clients own their bodies, the server owns the world

- **Movement:** each client simulates and owns its own avatar. Gorilla-style VR locomotion can't be predicted well by a server. Clients stream poses at about 30 Hz, and the server sanity-checks them (speed caps, teleport detection, frame-switch validity).
- **The server is authoritative** for item ownership (pickup is a request the server grants), crate physics, hits and damage, scores, lifts, and room state. It runs the same `packages/shared` systems.
- **Hits:** the attacker's client detects a hit with swept blade segments and sends a claim with a timestamp. The server validates it against about 250 ms of pose history (lag compensation) with a tolerance.
- **Remote avatars** render about 100 ms in the past from an interpolation buffer. Hands get a little extra smoothing.
- **Stack:** Node + **Colyseus** (rooms, matchmaking, reconnection, binary state sync) over WebSocket. Pose streams use a compact custom message: quantized positions relative to the frame, and smallest-three quaternions. WebTransport and WebRTC data channels are possible later optimizations behind the same `net/transport` interface. WebSocket is the baseline because it works everywhere, including Safari.
- **Rooms:** about 10-16 players per ring instance, public matchmaking plus private room codes.

### D8. Lights budget: emissive, not lights

- Saber blades become emissive cores plus additive glow sprites (`glowTex` already exists), with **no PointLight per saber**.
- If dynamic saber light is wanted, use a fixed pool of 2-4 lights assigned to the sabers nearest the camera each frame. A fixed count means no shader recompiles.

---

## 3. Target repository layout

```
saber-side/
├─ package.json            pnpm workspaces, scripts: dev, build, test, lint, e2e
├─ tsconfig.base.json      biome.json      .github/workflows/ci.yml
├─ apps/
│  ├─ client/
│  │  ├─ index.html        HUD markup only
│  │  └─ src/
│  │     ├─ main.ts        boot: detect capabilities → pick profile → start app state machine
│  │     ├─ app/           loop (fixed tick + render interp), states: boot/title/lobby/play/xr, settings
│  │     ├─ platform/      capability detection, profiles: desktop | touch | xr-vr | xr-ar
│  │     ├─ input/
│  │     │  ├─ actions.ts  action + pose schema
│  │     │  ├─ devices/    keyboard, mouse, trackpad, touch, gamepad, xr-controller, xr-hand, transient-pointer, gyro
│  │     │  └─ bindings/   default bindings per profile (data), rebinding + persistence
│  │     ├─ controllers/   piloted.ts, embodied.ts (arm locomotion), spectator.ts
│  │     ├─ render/
│  │     │  ├─ renderer.ts WebGLRenderer + WebXR setup, foveation, DPR policy
│  │     │  ├─ ring/       bend material patch, RingSpace.attach, real-space group
│  │     │  ├─ cameras/    third-person orbit, xr rig, tabletop rig
│  │     │  ├─ textures/   procedural canvas textures (paintTex, crateTex, signs...)
│  │     │  └─ fx/         particle pools, glow sprites, saber trails
│  │     ├─ world/         scene builders from level data: shell, promenade, shops, lifts, hub, end caps
│  │     ├─ avatar/        robot model, procedural animation, hand IK, remote interpolation
│  │     ├─ items/         saber / blaster / carrot visuals
│  │     ├─ ui/            DOM HUD (flat), in-world panels (XR), menus, room-code entry
│  │     ├─ net/           connection, transport, interpolation buffer, clock sync
│  │     └─ audio/         WebAudio: hum, clash, ambience (spatialized)
│  └─ server/
│     └─ src/              rooms/RingRoom.ts, authority/ (items, crates, hits), validation, history buffer
├─ packages/
│  └─ shared/
│     └─ src/
│        ├─ constants.ts   habitat dimensions, OMEGA, units (meters)
│        ├─ ring-space.ts  bend/unbend/wrap, frames
│        ├─ sim/           world, entities, systems: movement, collision, lifts, zero-g, crates, items, combat
│        ├─ content/       level layout as data: shops, lifts, crate stacks, table, spawn points
│        ├─ protocol/      message types, versioning, quantization codecs
│        └─ rng.ts
└─ docs/                   this plan, ARCHITECTURE.md, CONTROLS.md, NETCODE.md
```

Where today's code goes:

| `index.html` section (lines) | New home |
| --- | --- |
| CSS + HUD markup (1-127) | `apps/client/index.html`, `ui/` |
| renderer / scene (140-150) | `render/renderer.ts` |
| habitat scale + bend (151-212) | `shared/constants.ts`, `shared/ring-space.ts`, `render/ring/` |
| procedural textures, materials (213-413) | `render/textures/`, `render/materials.ts` |
| robot (414-567) | `avatar/robot.ts` (the model only; animation goes to `avatar/animate.ts`) |
| habitat, shops, landmarks, end caps (568-1057) | `shared/content/` (data) + `world/` (builders) |
| weapon table + items (1058-1168) | `shared/sim/items.ts` + `items/` visuals |
| crates (1169-1200), crate update (1706-1754) | `shared/sim/crates.ts` + `world/crates.ts` |
| particles (1201-1239) | `render/fx/` |
| input (1240-1295) | `input/devices/*`, `input/bindings/` |
| simulation `update()` (1296-1705) | split into `shared/sim/movement.ts`, `controllers/piloted.ts`, `avatar/animate.ts`, `cameras/third-person.ts` |
| lifts, hub, `updateReal` (1769-1995) | `shared/sim/lifts.ts`, `shared/sim/zero-g.ts`, `world/lifts.ts` |

---

## 4. Controls by platform

### MacBook (flat)

| Action | Keyboard + trackpad / mouse | Notes |
| --- | --- | --- |
| Move | WASD / arrows | Camera-relative by default; tank steering available as an option (today's behavior) |
| Look / orbit | Two-finger drag or mouse drag; optional pointer lock | Trackpad first: never *require* right-click |
| Zoom | Pinch or scroll | Mac trackpad pinch arrives as `wheel` with `ctrlKey` in Chrome/Firefox and as `gesturechange` in Safari; handle both |
| Swing saber | Click-drag: the drag direction picks the strike arc | Gives flat players directional strokes that map onto the synthesized hand pose (D5) |
| Block | Hold Shift+drag, or a dedicated key | Boost moves to a different key once combat exists |
| Jump / spin / grab / use | Space / X / G / F | Same as today |
| Gamepad | Left stick move, right stick look, triggers swing/block | Comes free through the Gamepad API |

### iPad (flat)

- **A floating left-thumb joystick** replaces the d-pad. Dragging on the right half looks around. Pinch zooms.
- **Saber:** swiping on the right half while holding a saber strikes along the swipe direction. Holding a two-finger press blocks.
- **Buttons:** jump, grab, use, and spin stay as large thumb targets inside the safe areas.
- **Optional gyro aim:** a "magic window" look mode using `DeviceOrientationEvent`. This needs `requestPermission()` from a user gesture on iOS.
- **Apple Pencil (stretch):** `pointerType: 'pen'` with tilt and azimuth drives saber angle directly.
- **Magic Keyboard / trackpad / gamepad** connected to an iPad switch automatically to the MacBook or gamepad profile.

### VR (`immersive-vr`)

- **Session:** request `local-floor` with `hand-tracking` and `layers` as optional features. Show an Enter VR button only when `navigator.xr.isSessionSupported('immersive-vr')` says yes.
- **Rig placement:** the rig sits in real space at the bend frame of the player's strip position (rotation about the ring axis by θ = −z/R). Room-scale motion is converted back to strip coordinates every tick. "Up" follows the floor as you travel around the ring.
- **Locomotion, Gorilla-style:** the robot has no legs, so arm locomotion fits naturally. Hands are sphere colliders. When a hand is in contact with a surface, the body moves opposite to the hand. On release, the body takes the recent hand velocity (multiplied, then capped). Floor gravity applies on the promenade. **The zero-g hub** uses the same mechanic with no gravity, so you push off walls and tubes.
- **Optional smooth locomotion:** thumbstick movement for comfort, with snap turn, a vignette, and a seated mode.
- **Items:** grip to grab, trigger to ignite or fire. A held saber is a capsule tracked 1:1. Hits use swept segments between ticks so fast swings register. When sabers clash, the rendered blade stops at the contact point (a "ghost hand"), with sparks and controller haptics.
- **Input sources:**
  - Quest controllers: `tracked-pointer` + `xr-standard` gamepad
  - Hand tracking: pinch / grip thresholds from joint poses
  - Vision Pro: hands, plus `transient-pointer` (gaze-and-pinch) for UI
- **UI:** in-world panels (canvas textures) attached to the left wrist and the lobby.
- **Performance budget (Quest 2/3):**
  - Frame rate: 72-90 Hz, with fixed foveation and dynamic resolution
  - Draw calls: at most about 150
  - Triangles: at most about 500k
  - Lights: no shadow maps, a fixed light count (D8)
  - Glass: minimal transparent overdraw (the hub and lift glass need care)
  - Verify that the bend chunk still compiles and renders correctly under multiview

### iPad XR reality check

**As of late 2026, Safari on iPadOS does not ship WebXR (neither `immersive-vr` nor `immersive-ar`) by default, and every iPad browser uses WebKit.** Apple's WebXR is on visionOS Safari. Most sources found while writing this plan agree, and the few that claim iPad support looked unreliable. Re-check the WebKit release notes before committing to anything. Options:

1. **(Recommended to start)** Make iPad flat play excellent (above), and add gyro "magic window" look as the XR-adjacent feel.
2. **Build the AR "tabletop" mode against the standard WebXR AR APIs** (`immersive-ar`, `hit-test`, `anchors`, `dom-overlay`). The ring becomes a diorama on your table that you play with touch. It runs today on Android Chrome and switches on for iPad automatically if Safari ships WebXR AR.
3. **Bridge to native AR on iPad** through a native wrapper app (WKWebView + ARKit bridge) or a commercial App Clip bridge. This is real work plus distribution overhead, so only do it if iPad AR is a hard requirement.
4. **If "Apple XR" was the intent, Vision Pro Safari already supports `immersive-vr`** and is covered by the VR profile.

---

## 5. Phases

Each phase ends with something runnable. After Phase 3, VR (Phase 4) and the AR/iPad work (Phase 5) can proceed in parallel. Sizes are relative (S/M/L).

```
P0 Groundwork ─► P1 Decompose + sim split ─► P2 Input + avatar model ─► P3 Multiplayer presence ─┬─► P4 WebXR VR ─────┐
                                                                                                └─► P5 iPad / AR ────┼─► P6 Combat + netcode ─► P7 Scale & ops
```

### Phase 0: Groundwork (S)

- Set up the pnpm workspace, Vite client, strict TypeScript, Biome, Vitest, and Playwright.
- Replace the Unity `.gitignore` with a Node/Vite one.
- Move the current script into `apps/client/src/legacy.js` **unchanged** (no logic edits) and serve it through Vite.
- Add a deterministic mode (fixed clock, seeded RNG shim for `Math.random`).
- Add Playwright screenshot baselines of a few fixed camera views at desktop and iPad viewports. These guard every later refactor.
- CI: lint, typecheck, unit tests, build, e2e screenshots.
- HTTPS preview deploys on each branch (a static host). WebXR requires a secure context.
- Local device testing: `vite --host` over HTTPS (basic-ssl or mkcert), and `adb reverse` for Quest.

**Exit:** the game looks and plays identically, is built by Vite, and is deployed from CI.

### Phase 1: Decompose and separate simulation from rendering (L)

- Extract modules in the order of section 3's mapping, keeping the screenshots green after each extraction (strangler pattern).
- Create `packages/shared`: constants in meters (D3), `ring-space.ts` (D4), level layout as data (`content/`).
- Introduce the entity/world model (D2) and move the authoritative state (player, crates, items, lifts) out of meshes. Add a render sync layer.
- Fixed 60 Hz tick with render interpolation (fixes P4). Seeded RNG for gameplay randomness (fixes P5).
- Saber lighting moves to emissive + glow (D8, fixes P6).
- **Upgrade three.js** to the latest stable release, pinned exactly (fixes P9). Port `outputEncoding` → `outputColorSpace`, re-tune light intensities for physically correct lighting, and re-verify the `onBeforeCompile` chunk replacements (`project_vertex`, normal transform, sprite path).
- Unit tests: bend/unbend round-trips, wrap, lift frame switches, movement integration, crate collisions. **Run the sim headless in Node.**

**Exit:** gameplay is the same, `shared/sim` runs in Vitest with no DOM, and screenshot diffs are within tolerance.

### Phase 2: Input layer and the embodied avatar model (M)

- Action schema, device adapters, per-profile bindings as data, rebinding UI with local persistence, and hot-swapping profiles (D6).
- `PilotedController` extracted from today's `update()`. Camera-relative movement as the default.
- The avatar becomes the embodied pose (D5): root + head + hands + hand state. Add procedural hand IK and synthesized poses for flat players. Sabers are held *in a hand*, not attached to the body.
- Rework MacBook trackpad and iPad touch controls (section 4), plus gamepad.

**Exit:** single player plays well on MacBook and iPad, with directional saber strokes. Input mapping is unit tested.

### Phase 3: Multiplayer presence (M)

- `apps/server` with Colyseus and a `RingRoom`. Join by public matchmaking or room code.
- Protocol v1 in `shared/protocol` with version negotiation and quantized pose codecs (D7).
- Clients own their avatars and stream them at 30 Hz. Interpolation buffer, clock sync, reconnection.
- Server-authoritative item pickup/drop and lifts. Crates are server-simulated with the shared systems, and clients interpolate them, with local visual prediction on hit.
- Headless bot clients for testing (scripted walkers).

**Exit:** eight people across MacBook and iPad see each other move, pass sabers around, and knock crates around consistently.

### Phase 4: WebXR VR (L), parallel with Phase 5

- XR session management, rig placement in the bend frame (section 4), and the meter / `playerScale` scaling.
- `EmbodiedController`: arm locomotion on the floor and in zero-g, an optional smooth-locomotion comfort mode, snap turn, vignette.
- Controller and hand-tracking device adapters, `transient-pointer` for Vision Pro, haptics.
- In-world UI: wrist menu, lobby panel, room-code entry.
- Performance pass against the Quest budget, including an on-device performance HUD.
- Automated testing with IWER (Meta's Immersive Web Emulation Runtime) in Playwright, plus a manual device checklist (Quest 3, Quest 2, Vision Pro).

**Exit:** VR and flat players share a room, and VR players can climb, fling themselves, float in the hub, and wield sabers at a stable frame rate.

### Phase 5: iPad XR-adjacent and AR (M), parallel with Phase 4

- Start with option 1 from the iPad section: gyro magic window, plus Pencil if it's wanted.
- Optionally add option 2: an `immersive-ar` tabletop rig with hit-test placement and touch play through `dom-overlay`. Validate on Android Chrome. It will light up on iPad if Safari ships WebXR AR.
- Revisit option 3 only on an explicit decision.

**Exit:** the iPad has a first-class experience. The AR mode is feature-detected and degrades cleanly.

### Phase 6: Combat and netcode hardening (L)

- Combat rules in `shared/sim/combat.ts`: blade-vs-body, blade-vs-blade clash, blaster bolts vs saber deflection, damage, knockback, respawn.
- Lag-compensated hit validation on the server (pose history buffer), with rate limits and plausibility checks.
- **Cross-play fairness:** decide how flat strokes and VR swings compete. Options include matchmaking by input type, stroke assist for flat players, and mode-specific rules.
- Game modes: free play (today's sandbox), saber duels, and a tag variant suited to arm locomotion.
- Spatial audio (hum, clash, impacts).

**Exit:** competitive play feels fair at about 100 ms latency in a 10-player room.

### Phase 7: Scale and operations (M, ongoing)

- **Server ops:** hosting with sticky room routing, metrics (rooms, CCU, tick time, bandwidth per player), error reporting on client and server, and load tests with bot swarms.
- **Content pipeline:** glTF assets alongside the procedural ones (gltf-transform, KTX2 textures, meshopt), lazy-loaded zones.
- **Identity:** anonymous guests with display names first, accounts later.
- **Safety:** if proximity voice chat is added (WebRTC through an SFU such as LiveKit), it needs moderation, mute/report/block, and age-appropriate defaults. Players of Gorilla Tag-style games skew young.
- **Docs:** `ARCHITECTURE.md`, `NETCODE.md`, `CONTROLS.md`, and contribution guidelines.

---

## 6. Testing strategy

| Layer | Tool | What |
| --- | --- | --- |
| Shared sim | Vitest (Node) | Ring math, movement, lifts, zero-g, crates, items, combat rules, codecs |
| Input | Vitest | Bindings → actions, profile hot-swap, synthesized hand poses |
| Rendering | Playwright screenshots (deterministic mode) | Fixed views at desktop and iPad viewports with touch emulation, before and after refactors |
| XR | Playwright + IWER | Session start, rig placement, controller and hand input paths |
| Network | Vitest + bot clients | Join/leave, ownership races (two players grabbing the same saber), reconnection, jitter/loss simulation |
| Devices | Manual checklist each release | MacBook Safari/Chrome, iPad Safari, Quest 3/2 browser, Vision Pro Safari |

---

## 7. Risks

| Risk | Mitigation |
| --- | --- |
| iPad Safari never ships WebXR | Make flat iPad first-class, keep AR feature-detected, and only build a native bridge on an explicit decision |
| Three.js upgrade breaks the bend shader | Upgrade in Phase 1 behind screenshot tests, keep the chunk patches in one module, and verify under multiview |
| VR comfort in a curved, rotating world | Keep "up" tied to the local floor, add comfort options (vignette, snap turn, seated), and playtest early in Phase 4 |
| Quest performance (glass, lights, overdraw) | Budget set in Phase 4, light pool (D8), an on-device performance HUD, and LOD for far ring sections |
| Client-owned movement enables speed cheats | Server plausibility checks, with server authority over everything that scores |
| Cross-play combat imbalance | The Phase 6 fairness decision, and mode or matchmaking separation if needed |
| The refactor stalls feature work | Strangler migration: the game stays playable and deployable after every PR |

---

## 8. Open questions for the owner

1. **iPad XR:** is great flat iPad play plus a feature-detected AR tabletop enough (recommended)? Or is iPad AR a hard requirement that justifies a native bridge? Or was Vision Pro the intended Apple XR target?
2. **Game direction:** is Rustball the base of Saber Side (a robot with sabers in Ring Seven)? This plan assumes yes.
3. **Room size and modes:** target players per room, and which mode ships first (sandbox, duels, or tag).
4. **Cross-play combat:** should VR and flat players fight each other, or only share social spaces?
5. **Hosting:** preferred vendor or budget for game servers and static hosting.
6. **Voice chat:** in scope or not? It adds a large moderation and safety burden.
7. **Unity:** confirm the project is web-only, so the Unity `.gitignore` and any Unity plans can be dropped.

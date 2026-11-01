# Initiative: Playing Saber Side in VR on Meta Quest

| | |
| --- | --- |
| **Status** | In progress: PR 1 (`feature/enter-vr`, #29) lets Quest players step into VR and drive. Next is `feature/vr-hands`. |
| **Phase** | P4, Meta Quest VR ([plan, section 8](../REFACTOR_PLAN.md#p4-meta-quest-vr-l)) |
| **Started** | 2026-11-01 |
| **Done when** | A kid puts on a Quest, opens the bookmarked game in Quest Browser, picks their robot, taps **Enter VR**, and rolls around the ring in first person with friends on iPads, picking up sabers and blasters, riding a lift, and floating in the hub, at a steady frame rate and without feeling sick. |

Quest Browser runs the game as a flat page, and from PR 1 it can step into VR. This initiative builds VR on WebXR
(`immersive-vr`), the way the plan decided
([section 9](../REFACTOR_PLAN.md#9-unity-or-webxr-decided-webxr)), so the Quest needs nothing installed: it's the same
URL as everyone else, and Quest players share the station with iPad and MacBook players.

The plan's controls for the Quest are in [section 5](../REFACTOR_PLAN.md#meta-quest-vr), and its performance budget is
there too. This doc turns them into PRs, and it's also the guide to trying VR on a headset, for players and for
developers.

## How to play on a Quest

PR 1 makes these steps work with the controllers. Hands, the wrist panel, and the comfort settings come in later
PRs, as the table below says.

1. **Open the game.** In Quest Browser, go to `https://saber-side.onrender.com`. Bookmark it, so next time it's one
   tap from the browser's start page.
2. **Come aboard.** The arrival screen shows on the flat page, as on an iPad: tap **Play**, or log in. Point a
   controller at a button and pull the trigger (or pinch, with hands). The same player works on the Quest and the
   iPad, so there's nothing to link.
3. **Enter VR.** Tap **Enter VR** at the bottom right of the page. Quest asks the usual question about entering VR,
   once. Stand in a clear space, or sit down: the game measures your eye height when you enter and puts your eyes at
   your robot's either way. Press **Y** to measure again (after standing up, say).
4. **Play.** You're the robot, in first person. Walking around your room moves it too. (From PR 2, your hands are its
   arms, and your friends see them move.)
5. **Leave.** Press the Meta button and choose to exit (or, from PR 3, pick **Exit VR** on the wrist panel). You're
   back on the flat page, still aboard. Driving into the Bot Maker or the Robot Registry leaves VR too, since their
   sheets are on the flat page.

### Controls

| Action | Touch controllers (PR 1) | Hand tracking (later) |
| --- | --- | --- |
| Drive | Left stick: the robot turns to the way you push, measured from where you're looking, and rolls | Push off the floor with your arms (PR 5) |
| Turn | Right stick: a 45° snap turn per push (smooth turning comes with the comfort settings, PR 5) | Turn your body |
| Look | Your head | Your head |
| Step or lean | Walk around your room: the robot comes with you | The same |
| Jump | A or X | Push down hard and let go (PR 5) |
| Spin attack | B | (none) |
| Pick up, swap, drop; ride a lift; board a ship | Grip, as G does on a keyboard | Make a fist near the item (PR 2) |
| Use: ignite a saber, fire a blaster, bite a carrot | Trigger, as F does (from PR 2, bring a carrot up to your mouth) | Pinch (PR 2) |
| Boost | Press the left stick in | (none) |
| Recenter | Y: measures your eye height again and turns you to face the way your robot faces | The Meta button's own recenter |
| In the hub, on a lift, or in a ship | The left stick works like the arrow keys | (later) |
| Wrist panel | Turn your left wrist to look at it (PR 3) | The same |

What the prompt line says ("Grip · Ride lift 2 up to the hub") floats a little below your view.

Driving, jumping, and the rest go through the same actions the keyboard and touch pad press, so a Quest player's robot
moves exactly like everyone else's.

## Decisions

### From the plan (owner decisions)

- **WebXR on Quest Browser**, no app store build ([section 9](../REFACTOR_PLAN.md#9-unity-or-webxr-decided-webxr)).
- **Session:** `immersive-vr` with `local-floor`, and `hand-tracking` as optional. The Enter VR button shows only on a
  device that supports it, and Quest's VR prompt is the only permission we ask for (D8).
- **One avatar for every platform** (D5). Quest players fill the pose from the headset and controllers or hands.
- **"Up" follows the floor.** The rig sits in the ring-bend frame at the player's place on the strip, so the floor is
  always level under your feet and the ring curves up ahead of you.
- **`playerScale`** scales the headset's eye height to the robot's (D3), so a tall grown-up and a short kid both see
  the station from a robot's eyes.
- **Locomotion:** arm locomotion, Gorilla Tag style, on the floor and in zero-g, with comfort options: thumbstick
  smooth locomotion, snap turn, a vignette, and seated mode.
- **No fighting yet**, so there's no saber collision or damage in VR either: sabers ignite and swing as toys.
- **Performance budget** for Quest 2 and 3: 72-90 Hz with fixed foveation, at most about 150 draw calls, at most about
  500k triangles, no shadow maps, a fixed light count, and little transparent overdraw.

### For VR (2026-11-01)

- **Build on today's three.js.** The owner asked for a build to test on a Quest, so PR 1 is built on three.js r128,
  and the upgrade (PR 0) no longer comes first. It's still a P1 item, and the VR code will move with it.

### Proposed here, for the owner to confirm

PR 1 builds all of these but the arm IK, so they can be tried on a headset before they're settled.

- **First person.** The camera is the robot's eye, and your own robot's head is hidden so it doesn't fill your view.
  Third person in VR moves the world without your head moving, which makes people sick.
- **Thumbstick driving comes first, arm locomotion second.** The plan wants both. Driving with the stick reuses the
  existing movement code, so a Quest player can roll around with friends from PR 1, and arm locomotion (PR 5) is a
  bigger job that benefits from playtests first.
- **The robot's arms follow your hands through IK** that solves for the arm angles already in the pose (`pose.ts`).
  Pose messages are "the robot as drawn", so friends see a Quest player's arms move with **no protocol change**.
- **One scale factor for the rig** absorbs both `playerScale` and the prototype's scene units (1 unit ≈ 0.364 m,
  `UNIT_M` in `ring-space.ts`). VR doesn't wait for P1's switch to meters; when that lands, only the factor changes.
- **Sheets stay flat.** Arriving, logging in, and rebuilding your robot happen on the flat page. Driving into the Bot
  Maker or the Robot Registry in VR ends the VR session, so its sheet shows on the page, rather than drawing the
  sheets in 3D.
- **Driving never turns your view.** The left stick turns the robot, not you, and only snap turns (or your own body)
  turn the view. Smoothly turning the world around a player is the quickest way to make them sick.

## Design

### The session and the loop

- **Enter VR button:** a HUD button, shown when `navigator.xr.isSessionSupported('immersive-vr')` resolves true. It
  requests the session from the tap (Quest requires a user gesture) with `requiredFeatures: ['local-floor']` and
  `optionalFeatures: ['hand-tracking']`.
- **The loop:** `frame()` in `game.js` called `requestAnimationFrame`, which stops firing while an XR session runs. It
  now runs from `renderer.setAnimationLoop`, which uses the page's animation frames when flat and the headset's in VR.
  Flat play and the e2e fake clock see no difference, so screenshots and the determinism test stay unchanged.
- **Built on the first trip into VR.** The rig, its camera, and the prompt panel are made when a session starts, not at
  boot: three.js draws every new object's id from `Math.random`, and flat frames mustn't shift because VR exists.
- **Leaving:** when the session ends, the flat camera and page take over again, and the robot stays where it was. The
  station link isn't touched, so you never drop off the station.
- **Fixed foveation** is turned on when the session starts, so the edges of each lens draw fewer pixels.

### The rig in the bend frame

Floor content is simulated on a flat strip (x across, z around, y up) and bent onto the ring in the vertex shader
(`render/ring/bend.ts`). The camera already lives in bent world space, so the VR rig does too:

- A `rig` group holds the XR camera. Every frame it's placed at `bendPoint` of the robot's strip position, turned to
  the floor's `bendUp`, and turned to the player's **view** heading (which only snap turns and Recenter change; see
  `shared/sim/vr-rig.ts`). Your head sits straight above the robot's wheel, at its eye height.
- **Head motion feeds back.** Each frame, the headset's movement across the play space (room-scale steps) is turned
  into a move along the strip and moves the robot, so stepping sideways moves your robot too. Walls stop the robot,
  and then the world holds you back.
- **Real space** (lift tubes, cabs, the hub): the robot is parked above y = 5000 and drawn unbent, `REAL_OFF` lower.
  The rig rides in the robot's own frame there, at its drawn position. Walking around the room doesn't move the robot
  up there; it just moves your view.
- **Scale:** `rig.scale` is the robot's eye height (scene units) ÷ your eye height (meters), measured when the session
  starts, when you press Y, and when Quest's own recenter fires, and kept between 0.8 and 4. Sitting down just gives a
  bigger factor. Because the station is still in the prototype's units, the same factor converts them.
- **What scaling the view costs.** The XR camera hangs from a scaled rig, so three.js's view space comes out scaled
  down too. Positions and lighting directions don't mind, but three things measure distances in view space, and
  `render/xr-view.ts` puts them back: sprite sizes (a patch to three's sprite shader, a no-op for the flat view), fog
  distances, and the reach of point and spot lights (both scaled for each VR frame, then restored). Bump maps come
  out a little stronger in VR; that's left as it is.
- The shader bend happens in world space before `viewMatrix`, so it works per eye with no change. That has to be
  checked once three.js renders both eyes in one pass (multiview), which the performance PR turns on.

### Your robot, in first person

- Your own robot is still built and posed, because friends see that pose. On your screen, its head is hidden while
  the headset draws (and shown again straight after), so you see your arms, your body when you look down, and your
  wheel.
- **Arms:** the robot's arms have shoulder, elbow, and wrist angles plus a grip curl (`RobotArm.cur`, the `arm0*` and
  `arm1*` pose fields). A small two-bone IK solves those angles from each controller's (or hand's) position and
  turn, clamped to what the robot's arm can reach. Grip and trigger drive `curl`.
- **Head:** the headset's turn relative to the body fills `headX`, `headY`, and `headZ`.
- The IK lives in `shared/sim/arm-ik.ts` (pure math, unit-tested), and the glue in `app/vr.ts`.

### Input

- The VR mode (`app/vr.ts`) reads each frame's `XRInputSource` gamepads before the game updates, and presses the same
  actions in the `keys` / `pressed` map that the keyboard and touch pad press, so the legacy `update()` drives the
  robot as usual. It only lets go of actions it pressed itself. On the floor, the left stick also steers the robot's
  heading directly. When P2's action map lands, this moves onto it.
- **Haptics:** a short pulse on picking up and dropping, a hum while a saber is lit, and a kick when a blaster fires.

### UI in VR

The DOM HUD can't be seen in a headset, so VR draws its own:

- **Wrist panel** (left wrist, shown when you turn it toward your face): the place name, station status, what you're
  holding, a comfort settings page (turning, vignette, seated mode, recenter), and **Exit VR**. It's a canvas texture,
  redrawn only when its text changes. The carrot initiative's crystal and paint readouts go here too when they land.
- **Prompts** ("Ride lift 2 up to the hub"): from PR 1, the prompt line floats a little below your view. PR 3 moves
  each one beside the thing it's about, as a world-space sign.
- A **performance readout** (frame rate, draw calls, triangles) on the wrist panel with `?perf`.

### Lifts, the hub, and ships

- **Lifts:** the rig rides in the cab (PR 1). PR 4 adds the comfort vignette for the 9-second ride.
- **The hub:** zero-g floating with the stick (PR 1: it works like the arrow keys, and a snap turn turns the robot,
  since it flies the way it faces), then arm locomotion in PR 5, which is where it's most fun: pushing off the drum and
  catching drifting things.
- **Ships and planets** (`app/flight.ts`) draw their own scene with a chase camera. For now, in VR, you ride where
  that camera is, kept level, and the left stick flies like the arrow keys. What comes next is open question 1.

## Trying it on a headset (developers)

- **A PR:** every PR's preview (`https://saber-side-pr-<n>.onrender.com`) works in Quest Browser and joins the
  staging station. That's the easiest way to try a VR PR: open the link on the Quest.
- **Same Wi-Fi:** run `pnpm dev:https` on the laptop, then open the **Network** URL Vite prints
  (`https://<laptop IP>:5173`) in Quest Browser. Accept the self-signed certificate warning once. WebXR needs HTTPS,
  which is why plain `pnpm dev` won't offer Enter VR over the network.
- **USB:** with the Quest in developer mode (turned on in the Meta Horizon phone app), plug it in and run:

  ```bash
  adb reverse tcp:5173 tcp:5173
  ```

  Then run `pnpm dev` and open `http://localhost:5173` on the Quest. `localhost` counts as secure, so there's no
  certificate to accept.
- **Debugging:** with the Quest on USB, `chrome://inspect` in desktop Chrome lists Quest Browser's tabs, with the
  console and performance tools.
- **Without a headset:** Meta's Immersive Web Emulator extension for desktop Chrome fakes a Quest, which is good
  enough for input and UI work. Performance must be checked on a real Quest.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable on every device. Update the status here
as each one merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 0 | No longer first: PR 1 is built on r128 | `foundation/three-upgrade` | Upgrade three.js | The P1 item: three.js from r128 to a current release, re-checking the bend shader patches, color management, and light intensities. Changes the picture, so CI re-records the baselines. | none |
| 1 | **Done** (#29) | `feature/enter-vr` | Let Quest players step into the station in VR | The Enter VR button, `setAnimationLoop`, the rig in the bend frame and real space (and at the chase camera in a ship), the rig scale measured from your height, Y to recenter, first person with your own head hidden, head-relative stick driving, snap turn, and the buttons pressing the keyboard's actions. Room-scale steps move the robot. The prompt line floats in view. Sprites, fog, and lights keep their size and reach under the scaled view. Fixed foveation. Driving into the Bot Maker or the Robot Registry leaves VR to show its sheet. Rig rules in `shared/sim/vr-rig.ts`; IWER in Playwright (`e2e/vr.spec.ts`). | none |
| 2 | | `feature/vr-hands` | Let Quest players use their hands | Controllers and hand tracking drive the robot's arms through IK (`shared/sim/arm-ik.ts`), so friends see them. Grip to pick up, swap, and drop; trigger or pinch to use; carrots eaten by bringing them to your mouth. Haptics. | none |
| 3 | | `feature/vr-wrist-panel` | Put the HUD on your wrist in VR | The wrist panel (place, station status, holding, comfort settings, Exit VR), world-space prompts beside what they're about, touching a sign to act, and the `?perf` readout. | none |
| 4 | | `feature/vr-lifts-and-hub` | Ride the lifts and float in the hub in VR | The rig in the lift cab with the comfort vignette, and stick floating in the zero-g hub. | none |
| 5 | | `feature/arm-locomotion` | Let Quest players move by pushing off with their arms | Gorilla Tag style movement on the floor and in the hub: hands as sphere colliders, push to move, let go to fling (capped). Rules in `shared/sim/arm-locomotion.ts`. The rest of the comfort options: smooth turning, vignette strength, seated mode. | none |
| 6 | | `foundation/quest-performance` | Hold a steady frame rate on Quest | A pass on a real Quest 2 and 3 against the budget: fixed foveation, framebuffer scale, multiview (re-checking the bend per eye), emissive sabers instead of a light each (D9, if P1 hasn't done it), and draw-call cuts. | none |
| 7 | Waiting on open question 1 | `feature/vr-ships` | Fly ships from the cockpit in VR | Board a ship and fly it in first person, with the stick and trigger. | none |

Handing items to friends needs P3's server-authoritative pickup and drop, which isn't done yet. When it lands, a Quest
player hands things over the same way: let go of the item in a friend's grabber.

The protocol column assumes nothing in this initiative changes what the server sees. If one does (a "playing in VR"
flag on a player's seat, say), bump `PROTOCOL_VERSION` to the next free number when it merges.

## Tests

- **Unit:** the rig's rules (`shared/sim/vr-rig.ts`, from PR 1): head yaw, stick heading, turning the short way,
  head-to-strip steps, the rig scale, and snap turns. Later: arm IK (reaching, out of reach, elbow direction) and arm
  locomotion (push, fling cap, zero-g).
- **E2E with IWER** (Meta's WebXR emulation runtime, an emulated Quest 3 injected into the page in Playwright,
  `e2e/vr.spec.ts`):
  - The Enter VR button stays hidden without a headset, and shows and starts a session with one. (PR 1)
  - The view sits on the robot's eye line in the bend frame, looking the way it faces, level with the floor, before
    and after driving. (PR 1)
  - The left stick drives where you look, the right stick snap-turns once per push, A jumps, and grip and trigger run
    cleanly. (PR 1)
  - Ending the session goes back to the flat game. (PR 1)
  - The flat screenshots and the determinism test stay unchanged. (PR 1)
  - Later: the rig on a lift and in the hub, a grip near a saber picks it up, and the trigger ignites it.
- **Manual checklist** on a Quest before each VR PR merges:
  - Enter VR from a production-like build (the PR preview), on Quest 2 and Quest 3.
  - Recenter, standing and seated.
  - Drive a lap of the promenade at a steady frame rate (`?perf`, once PR 3 adds it).
  - Ride a lift up and down, and float in the hub.
  - Pick up, use, and drop a saber, a blaster, and a carrot, with controllers and with hands.
  - An iPad friend sees your arms move and your robot drive.
  - Leave VR and come back.

## Risks

| Risk | Mitigation |
| --- | --- |
| Motion sickness in a curved, spinning world | First person with "up" on the floor, snap turn by default, a vignette while moving and riding lifts, seated mode, and short playtests with the kids before each PR merges |
| Frame rate on Quest 2 | The `?perf` readout from PR 3, emissive sabers, foveation, multiview, and the budget checked on the device in PR 6 |
| The bend shader breaks under multiview | A screenshot of each eye through IWER, and a manual check on the device |
| The robot's arms can't reach where your hands are | IK clamps to the arm's reach, and your hands are drawn at the robot's hands, not your own |
| Rig scale feels wrong (giant or tiny) | Measured on Enter VR, on Y, and on Quest's recenter, and clamped |
| Something else in three.js measures view-space distances and looks wrong in VR | `render/xr-view.ts` already corrects sprites, fog, and light reach; check new effects in the headset |
| Quest Browser updates change WebXR behavior | Re-run the manual checklist when the Quest updates, and keep the session request to standard features |

## Open questions

1. **Ships in VR?** Flying a ship in first person is great fun but easy to feel sick in. Options: fly from the cockpit
   (PR 7), or have Quest players ride along and leave VR to fly. Recommended: leave ships flat for now, and decide
   after the kids have tried PRs 1-5.
2. **Order against the economy.** The plan does P5 (the carrot initiative) before P4. Should this initiative wait until
   the carrot economy is done, or run alongside it?
3. **Which headsets?** The checklist assumes Quest 2 and Quest 3. Is there a Quest 3S or Quest Pro in the house?

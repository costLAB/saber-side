# Initiative: Playing Saber Side in VR on Meta Quest

| | |
| --- | --- |
| **Status** | In progress: PR 1 (`feature/enter-vr`, #29) lets Quest players step into VR and drive, and PR 2 (`feature/vr-hands`, #34) makes their hands the robot's arms, PR 8 (#36) shows only your own robot's hands and arms, PR 9 (#37) adds the Selfie, and PR 5 (#38) lets you push off the floor with your arms. Next is `feature/vr-wrist-panel`, then `feature/vr-lifts-and-hub`. |
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

PR 1 makes these steps work with the controllers, and PR 2 with your hands too. The wrist panel and the comfort
settings come in later PRs, as the table below says.

1. **Open the game.** In Quest Browser, go to `https://saber-side.onrender.com`. Bookmark it, so next time it's one
   tap from the browser's start page.
2. **Come aboard.** The arrival screen shows on the flat page, as on an iPad: tap **Play**, or log in. Point a
   controller at a button and pull the trigger (or pinch, with hands). The same player works on the Quest and the
   iPad, so there's nothing to link.
3. **Enter VR.** Tap **Enter VR** at the bottom right of the page. Quest asks the usual question about entering VR,
   once. Stand in a clear space, or sit down: the game measures your eye height when you enter and puts your eyes at
   your robot's either way. Press **Y** to measure again (after standing up, say).
4. **Play.** You're the robot, in first person. Walking around your room moves it too. Your hands are its arms, and
   your head turns its head, so your friends see you wave, point, and look around. Reach for a saber and squeeze to
   pick it up.
5. **Leave.** Press the Meta button and choose to exit (or, from PR 3, pick **Exit VR** on the wrist panel). You're
   back on the flat page, still aboard. Driving into the Bot Maker or the Robot Registry leaves VR too, since their
   sheets are on the flat page.

### Controls

| Action | Touch controllers (PR 1, PR 2) | Hand tracking (PR 2, and later) |
| --- | --- | --- |
| Drive | Left stick: the robot turns to the way you push, measured from where you're looking, and rolls. Or put your hands on the floor and push off (PR 5) | Push off the floor with your hands (PR 5) |
| Turn | Right stick: a 45° snap turn per push, or smooth turning with the comfort setting (PR 5) | Turn your body |
| Look | Your head (and the robot's head turns with it) | Your head |
| The robot's arms | Your hands: its hands go where yours are, as near as its arms reach. Squeezing grip and trigger curls its fingers | Your hands, and your fingers curl its fingers |
| Step or lean | Walk around your room: the robot comes with you | The same |
| Jump | A or X, or push down hard on the floor and let go (PR 5) | Push down hard and let go (PR 5) |
| Spin attack | B | (none) |
| Pick up, swap, drop; ride a lift; board a ship | Grip, as G does on a keyboard, but with the hand that grips: it picks up what's near that hand, and gripping again with that hand drops it (thrown, if your hand is swinging). The other hand's grip doesn't drop it | Make a fist near the item |
| Use: switch a saber off and on, fire a blaster, bite a carrot | Trigger, as F does. Bring a carrot up to your mouth to bite it | Pinch. The carrot works the same way |
| Feel it | A buzz on picking up and dropping, a hum while a saber is lit, a kick for each blaster shot | (no haptics) |
| Boost | Press the left stick in | (none) |
| Selfie (PR 9) | Press the right stick in: a mini-me of your robot floats in front of you. The right stick spins it, or grip it and turn your hand | Make a fist on the mini-me and turn your hand |
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

### From the owner (2026-11-04)

- **Walking in VR is arm-push locomotion.** Improving how Quest players move on the floor is this initiative's PR 5:
  pushing off the floor with your hands, Gorilla Tag style. Moving in the zero-g hub moves to the
  [zero-g swimming initiative](zero-g-swimming.md) instead, as a breaststroke through the air.
- **In first person you see only your robot's hands and arms.** Its head, body, and wheel are hidden from you, so they
  don't block your view. Everyone else still sees your whole robot, and so do you in the **Selfie** view.
- **Selfie** (a button, on every device) lets you look at your own robot:
  - **In VR:** a small live copy of your robot floats in front of you (a "mini-me"), and you spin and tilt it with your
    hand or the stick. The camera never moves, so it doesn't make you sick.
  - **On an iPad or Mac:** the camera pulls back and orbits your robot, and you spin it around.
- **Ships in VR are flown from the cockpit, with grabbable controls.** You sit in the cockpit in first person and fly
  by grabbing a joystick and a throttle with your hands, like a real ship. This answers open question 1.

### Proposed here, for the owner to confirm

PR 1 builds all of these but the arm IK, and PR 2 builds that, so they can be tried on a headset before they're
settled.

- **First person.** The camera is the robot's eye. Third person in VR moves the world without your head moving, which
  makes people sick. (What you see of your own robot is now the owner's decision above: hands and arms only.)
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

- Your own robot is still built and posed, because friends see that pose. On your screen, everything on its core but
  the arms (its head, body, wheel, and mouth hatch) is hidden while the headset draws, and shown again straight after
  (`firstPersonHidden` in `avatar/robot.ts`, PR 8). So you see only its hands, its arms, and what they hold, and the
  floor's blob shadow under you (owner decision, 2026-11-04).
- **Selfie (PR 9):** the rules (the orbit, its limits, the mini-me's size and place) are in `shared/sim/selfie.ts`.
  - **In VR** (`app/vr-selfie.ts`): pressing the right stick in opens a second, small copy of your robot, built from
    the same parts and paint the first time it opens, and posed from your robot every frame (its arms wave when yours
    do). It floats half a meter in front of where you were looking when you opened it, a little below your eyes, at a
    quarter of the robot's size, facing you, and stays put in your room while you look around. The right stick spins
    and tilts it (no snap turns while it's open), or reach in and grip it, and it turns with your hand; that grip
    doesn't reach the game, so it picks nothing up and drops nothing. Pressing the right stick in again puts it away.
    It's drawn in real space (parked `REAL_OFF` up), so the bend shader draws it exactly where the rig puts it. It
    doesn't hold copies of your items. It costs one extra robot draw, and only while it's open.
  - **On flat devices** (`app/selfie.ts`): a **Selfie** button at the bottom center of the screen (or P) swings the
    chase camera round to the front of your robot. Dragging, the arrow keys, or Q and E orbit it; up and down tilt it;
    scroll, pinch, + and − zoom. The robot drives nothing while it's open, but grab and use still work, so you can light
    a saber for the picture. Selfie or P again puts the chase camera back. It works on the floor, on a lift, and in
    the hub, and closes when you board a ship.
- **Arms:** the robot's arms have shoulder, elbow, and wrist angles plus a grip curl (`RobotArm.cur`, the `arm0*` and
  `arm1*` pose fields). A small two-bone IK solves those angles from each controller's (or hand's) grip pose, so the
  robot's grip lands on yours and its hand points the way your hand does (PR 2):
  - Your left hand drives the robot's left arm, and your right its right, measured from the robot's shoulders in its
    own frame, at the rig's scale.
  - Out of reach, the arm stretches straight toward your hand, so its hand goes as near as it can. The elbow points
    down, out, and a little back; if the wrist can't bend far enough for the way your hand points, the elbow swings
    round, and failing that the hand points the nearest way it can, so the grip still lands on yours.
  - Grip and trigger (or how far a tracked hand's fingers are curled) drive `curl`. The hand holding something
    keeps a firm grip.
  - The arms aren't eased: they follow your hands frame by frame. While the robot spins, rolls out of the Bot Maker,
    or flies a ship, the legacy animation poses the arms as before.
- **Head:** the headset's turn relative to the body fills `headX`, `headY`, and `headZ` (clamped to how far a head
  turns), so friends see where you look. Your own copy stays hidden.
- **Held items** sit in the robot's grip on the hand that picked them up, turned with your hand: a saber's blade
  and a carrot's tip point straight out of your fist, and the blaster's barrel points ahead with its body on top.
- The IK lives in `shared/sim/arm-ik.ts` (pure math, unit-tested). The hand rules (gestures, curl, the mouth,
  haptics) are in `shared/sim/vr-hands.ts`, and the glue in `app/vr-hands.ts`, which `app/vr.ts` drives. The legacy
  `update()` asks `vr.poseArm`, `vr.poseHead`, and `vr.poseGrip` each frame (they do nothing when flat), and grabs
  from `vr.grabHand()`.
- **Friends see it with no protocol change:** presence (`app/presence.ts`) sends the arm and head angles as drawn,
  and VR writes them where the animation does. What a robot holds isn't sent yet (P3's server-authoritative pickup).

### Arm locomotion (PR 5)

The owner's "walking in VR", on the ring floor only (the hub is the zero-g swimming initiative's). The rules are in
`shared/sim/arm-locomotion.ts`, and `app/vr.ts` applies them each frame on the floor.

- **The floor for your hands** is a third of your eye height (measured when you enter VR or press Y), so a kid and a
  grown-up both reach it by bending a little. Seated, it's just over half your eye height, about your lap. A hand has
  to rise a little past it to let go, so it doesn't flicker. Touching down buzzes that hand.
- **Pushing:** while a hand is down, the robot moves against it, as if the hand held on to the floor. Two hands down
  average their pushes. A hand that jumps more than 30 cm in one frame lost tracking, and doesn't push.
- **Flinging:** when the last hand lets go, the robot carries on at the speed you were pushing (smoothed, capped at
  3 m/s of your room, about the robot's top driving speed), and glides to a stop.
- **Jumping:** pushing down fast and letting go jumps, 2.5 times your push's speed at the rig's scale, so a good shove
  is a hop about as high as A's.
- The robot doesn't turn to face where it's pushed, so friends see it slide; the stick still turns and drives it.

**Comfort settings** (`shared/sim/vr-comfort.ts`), kept in the browser, and set on the flat page for now: a small
**VR comfort** panel above Enter VR, shown only on a device that can run VR (`ui/vr-comfort.ts`). The wrist panel
(PR 3) gets a page for them too.

- **Turning:** snap (45° per push, the default) or smooth (up to 2.2 rad/s with the stick).
- **Vignette:** off, low (the default), or high. The edges of the view darken as the robot moves faster than a
  stroll across the floor, or as the view turns smoothly.
- **Seated:** stepping and leaning don't move the robot (leaning just moves your view), and your hands find the floor
  at your lap.
- **Push off the floor with your hands:** on by default; turn it off to play with the sticks only.

### Input

- The VR mode (`app/vr.ts`) reads each frame's `XRInputSource` gamepads before the game updates, and presses the same
  actions in the `keys` / `pressed` map that the keyboard and touch pad press, so the legacy `update()` drives the
  robot as usual. It only lets go of actions it pressed itself. On the floor, the left stick also steers the robot's
  heading directly. When P2's action map lands, this moves onto it.
- **Grabbing and using are per hand** (PR 2). A hand's grip (or fist) presses `grab` on its own, and the legacy grab
  picks up what's nearest that hand's grip on the robot (within about 0.45 m on a grown-up), instead of nearest the
  robot. Gripping with the hand that holds the item, away from anything, drops it, with the hand's speed (capped);
  the other hand gripping thin air leaves it be. The trigger (or a pinch) presses `use`.
- **Hand tracking** has no buttons, so `app/vr-hands.ts` reads the joint poses: the four fingertips curled in to the
  wrist make a fist, and thumb and index tips together make a pinch, each with a little slack so it doesn't flicker
  (`shared/sim/vr-hands.ts`).
- **Eating:** a carrot held up to your mouth (a little below and in front of your eyes) takes a bite, and another as
  soon as each one's done, while it stays there.
- **Haptics:** a short pulse on picking up and dropping, a hum while a saber is lit, and a kick when a blaster fires
  (`gamepad.hapticActuators`, where the controller has them).

### UI in VR

The DOM HUD can't be seen in a headset, so VR draws its own:

- **Wrist panel** (PR 3, `app/vr-wrist.ts`): an 18 by 12 cm panel on the back of your left wrist, shown when you turn
  it toward your eyes (with a little slack, so it doesn't flicker). Press its buttons with your right fingertip (6 cm
  ahead of the controller's grip): a press happens on touching a button, and the next one only after the finger
  comes away. The rules (facing, touching, pressing) are in `shared/sim/vr-wrist.ts`.
  - **Main page:** where you are, the station's status, who you're playing as and your wallet (the page HUD's own
    text), what you're holding, and **Selfie**, **Comfort**, and **Exit VR**.
  - **Comfort page:** turning (snap or smooth), the vignette (off, low, high), seated, pushing off with your hands,
    **Recenter**, and **Back**. Changes save in the browser, the same settings as the flat page's panel.
  - It's a canvas texture, redrawn only when its text changes. The carrot initiative's crystal and paint readouts go
    here too when they land.
- **Prompts** ("Ride lift 2 up to the hub"): on the floor, a prompt about a lift or an item is a sign floating beside
  it (over the lift, or over the item), turned to face you, and the floating line below your view gives way to it.
  Reach out and touch the sign to do what it says, as gripping does. A sign that appears where your hand already is
  waits for the hand to reach in, so idle hands don't press it. Other prompts (the hub, ships, carrot beds) stay on
  the floating line.
- A **performance readout** (frame rate, draw calls, triangles) on the wrist panel with `?perf`.

### Lifts, the hub, and ships

- **Lifts:** the rig rides in the cab (PR 1). PR 4 adds the comfort vignette for the 9-second ride.
- **The hub:** zero-g floating with the stick (PR 1: it works like the arrow keys, and a snap turn turns the robot,
  since it flies the way it faces), then arm locomotion in PR 5, which is where it's most fun: pushing off the drum and
  catching drifting things.
- **Ships and planets** (`app/flight.ts`) draw their own scene with a chase camera. For now, in VR, you ride where
  that camera is, kept level, and the left stick flies like the arrow keys. PR 7 puts you in the cockpit (owner
  decision, 2026-11-04):
  - You sit in the pilot's seat in first person, and the rig rides in the ship's frame, so the cockpit stays still
    around you while space moves outside it.
  - A **joystick** (by your right hand) steers: grab it and tilt it to pitch and roll, twist it to turn. A **throttle**
    (by your left hand) sets the speed: grab it and push it forward or pull it back. Letting go of the joystick
    springs it back to center; the throttle stays where you left it. Trigger on the joystick fires the ship's laser.
  - A comfort vignette closes in while the ship turns fast. Haptics buzz on grabbing the controls and on firing.
  - The rules for turning a grabbed control's pose into stick and throttle values go in `shared/sim/vr-cockpit.ts`,
    feeding the same ship controls the arrow keys do (`shared/sim/ship.ts`), so friends see the ship fly as usual.

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
| 2 | **Done** (#34) | `feature/vr-hands` | Let Quest players use their hands | Controllers and hand tracking drive the robot's arms through IK (`shared/sim/arm-ik.ts`), and the headset turns its head, so friends see both. Per-hand grabbing: grip (or a fist) picks up what's near that hand, the item sits in that hand turned with yours, and letting go throws it with your swing. Trigger or pinch to use; carrots eaten by bringing them to your mouth. Fist and pinch read from the hand joints (`shared/sim/vr-hands.ts`). Haptics on pick-up, drop, a lit saber, and blaster shots. | none |
| 3 | **Done** (#PRNUM) | `feature/vr-wrist-panel` | Put the HUD on your wrist in VR | The wrist panel (place, station status, holding, comfort settings, Exit VR), world-space prompts beside what they're about, touching a sign to act, and the `?perf` readout. | none |
| 4 | | `feature/vr-lifts-and-hub` | Ride the lifts and float in the hub in VR | The rig in the lift cab with the comfort vignette, and stick floating in the zero-g hub. | none |
| 5 | **Done** (#38) | `feature/arm-locomotion` | Let Quest players move by pushing off with their arms | The owner's "VR walking": Gorilla Tag style movement on the ring floor: hands as sphere colliders, push to move and jump, let go to fling (capped). Rules in `shared/sim/arm-locomotion.ts`. The rest of the comfort options: smooth turning, vignette strength, seated mode. Moving in the hub is the [zero-g swimming initiative](zero-g-swimming.md)'s PR 2. | none |
| 6 | | `foundation/quest-performance` | Hold a steady frame rate on Quest | A pass on a real Quest 2 and 3 against the budget: fixed foveation, framebuffer scale, multiview (re-checking the bend per eye), emissive sabers instead of a light each (D9, if P1 hasn't done it), and draw-call cuts. | none |
| 7 | | `feature/vr-ships` | Fly ships from the cockpit in VR | Board a ship and sit in its cockpit in first person. Fly by grabbing the joystick and throttle with your hands (`shared/sim/vr-cockpit.ts`), fire with the joystick's trigger, a vignette on fast turns, and haptics. | none |
| 8 | **Done** (#36) | `feature/vr-hide-own-body` | Show only your robot's hands and arms in VR | Hides your own robot's body and wheel (its head is already hidden) while the headset draws, leaving the hands, arms, and held items. Friends still see all of it. | none |
| 9 | **Done** (#37) | `feature/selfie-view` | Let players take a look at their own robot | The **Selfie** button on every device: the mini-me in VR (grab or stick to spin it), and an orbiting camera on iPad and Mac. | none |

Handing items to friends needs P3's server-authoritative pickup and drop, which isn't done yet. When it lands, a Quest
player hands things over the same way: let go of the item in a friend's grabber.

The protocol column assumes nothing in this initiative changes what the server sees. If one does (a "playing in VR"
flag on a player's seat, say), bump `PROTOCOL_VERSION` to the next free number when it merges.

## Tests

- **Unit:** the rig's rules (`shared/sim/vr-rig.ts`, from PR 1): head yaw, stick heading, turning the short way,
  head-to-strip steps, the rig scale, and snap turns. The arm IK (`shared/sim/arm-ik.ts`, from PR 2): reaching,
  pointing the hand, out of reach, too close, the elbow's direction, the two arms mirrored, the wrist's limits, and
  no flips while the hand moves smoothly. The hand rules (`shared/sim/vr-hands.ts`, PR 2): curl, fist, pinch, and the
  mouth. Arm locomotion (`shared/sim/arm-locomotion.ts`, PR 5): where the floor is, pushing, two hands, ignoring a
  hand that loses tracking, letting go only past the slack, the fling cap, the glide to a stop, and the jump. Comfort
  (`shared/sim/vr-comfort.ts`, PR 5): reading saved settings, smooth turning, and the vignette.
- **E2E with IWER** (Meta's WebXR emulation runtime, an emulated Quest 3 injected into the page in Playwright,
  `e2e/vr.spec.ts`):
  - The Enter VR button stays hidden without a headset, and shows and starts a session with one. (PR 1)
  - The view sits on the robot's eye line in the bend frame, looking the way it faces, level with the floor, before
    and after driving. (PR 1)
  - The left stick drives where you look, the right stick snap-turns once per push, A jumps, and grip and trigger run
    cleanly. (PR 1)
  - Ending the session goes back to the flat game. (PR 1)
  - The flat screenshots and the determinism test stay unchanged. (PR 1)
  - Moving a controller moves the robot's arm, its hand lands on yours, out of reach it stretches toward it, and the
    left hand drives the left arm. Turning the headset turns the robot's head. (PR 2)
  - A grip near the saber on the weapon table picks it up in that hand (lit, with a buzz and a hum), the trigger
    switches it off and on, the other hand's grip doesn't drop it, and gripping again away from the table does.
    (PR 2)
  - A blaster kicks when it fires, and a carrot held up to your mouth gets bitten. (PR 2)
  - Hand tracking (IWER's hands, with a fist pose added): hands pose the arms, a fist picks up the saber, and a
    pinch switches it off. (PR 2)
  - Hands down on the floor and pulled back move the robot forward by as much (at the rig's scale), with a buzz on
    touching down; lifting them slowly leaves it there; a quick push and letting go flings it, with the vignette
    closing in, and it glides to a stop; pushing down hard and letting go jumps. (PR 5)
  - The comfort panel shows on a VR device's flat page and saves its settings; seated, leaning doesn't move the robot;
    smooth turning turns the view a little each frame; with arm walking off, hands on the floor push nothing. (PR 5)
  - The wrist panel shows only when the back of your wrist faces you, with where you are, what you hold, and the
    `?perf` line; its Comfort page switches to smooth turning and saves it; Selfie opens the mini-me; Exit VR ends the
    session. (PR 3)
  - At the weapon table the prompt is a sign over the table, and touching it picks the item up. (PR 3)
  - Later: the rig on a lift and in the hub.
  - Your own head, body, and wheel aren't drawn in the headset's view and your arms are, every part is visible again
    between frames (so the pose friends are sent is the whole robot), and leaving VR draws it all again. (PR 8)
  - Selfie opens the mini-me in VR, posed like your robot, half a meter in front of you; the right stick spins it
    without snap-turning, and a hand gripping it turns it without dropping what that hand holds. On a flat page it
    swings the camera to the robot's front, the arrows and dragging orbit it while the robot stays put, and closing it
    puts the chase camera back and the arrows drive again. (PR 9)
  - In a ship, grabbing and tilting the joystick turns it, and pushing the throttle speeds it up. (PR 7)
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

1. ~~**Ships in VR?**~~ Answered 2026-11-04: from the cockpit, with grabbable controls (PR 7).
2. **Order against the economy.** The plan does P5 (the carrot initiative) before P4. Should this initiative wait until
   the carrot economy is done, or run alongside it?
3. **Which headsets?** The checklist assumes Quest 2 and Quest 3. Is there a Quest 3S or Quest Pro in the house?
4. **Selfie, as built in PR 9** (picked so the PR could ship; easy to change):
   - The flat button sits at the bottom center (the top right is kept empty), and P is its key.
   - In VR it opens by pressing the right stick in, or with the wrist panel's Selfie button (PR 3).
   - The mini-me hangs still in your room where you opened it, rather than following your head.
   - It doesn't copy what your robot holds.
   - The flat Selfie lets you grab and use (to light a saber for the picture) but not drive, jump, or spin.
5. **Arm locomotion, as built in PR 5** (all numbers in `shared/sim/arm-locomotion.ts`, easy to tune after a try):
   - Your hands find the floor at a third of your eye height (about knee height), not the real floor, so nobody has
     to touch the ground. Is that too high or too low?
   - Contact alone pushes: no grip button needed, the same as with tracked hands.
   - The fling is capped at 3 m/s of your room, and a push down jumps 2.5 times as fast as you pushed.
   - The robot slides without turning to face where you push it.
   - The comfort settings sit on the flat page above Enter VR, and on the wrist panel's comfort page (PR 3). The
     vignette is on at low by default.
6. **Wrist panel and signs, as built in PR 3:**
   - The panel is on the back of the left wrist and pressed with the right fingertip; there's no laser pointer.
   - Only floor prompts about a lift or an item get a sign; the hub's, the ships', and the carrot beds' stay on the
     floating line.
   - Touching a sign does what the prompt says (like gripping), with no button to press.

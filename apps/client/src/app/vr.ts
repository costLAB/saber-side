import type { Comfort } from '@saber-side/shared';
import {
  ARM_LOCO,
  armLocoStep,
  armPivot,
  armStretch,
  bendPoint,
  bendUp,
  glide,
  headYaw,
  MIN_HEAD_HEIGHT,
  newArmLoco,
  R_IN,
  rigScale,
  rigToStrip,
  SELFIE,
  SIGN_REACH,
  STICK_DEADZONE,
  shortArm,
  smoothTurn,
  snapTurn,
  stickHeading,
  turnToward,
  VR_STEER_RATE,
  vignetteAmount,
  wrapAngle,
} from '@saber-side/shared';
import * as THREE from 'three';
import { firstPersonHidden, type Robot, type RobotArm, type RobotKit, setArmReach } from '../avatar/robot';
import type { DrawTexFn } from '../render/kit';
import { cullBent } from '../render/ring/bent-cull';
import { createScaledViewDraw, keepSpriteSizeInScaledViews } from '../render/xr-view';
import { offerVr } from '../ui/enter-vr';
import { comfortPanel, loadComfort, saveComfort } from '../ui/vr-comfort';
import { PILOT_EYE } from '../world/ship';
import type { FlightMode } from './flight';
import { createCockpit } from './vr-cockpit';
import { createVrHands, type GrabHand, type HeldItem } from './vr-hands';
import { createMiniMe } from './vr-selfie';
import { createWristPanel } from './vr-wrist';

// Playing on a Meta Quest: the game in WebXR `immersive-vr`, in first person.
//
// The XR camera hangs from a rig that's placed every frame at the player's robot, so you see through its eye:
// - on the floor, the rig sits in the ring-bend frame at the robot's place on the strip, so the floor is always level
//   under your feet and the ring curves up ahead of you. Stepping around your room moves the robot.
// - on a lift or in the hub (real space), the rig rides in the robot's own frame.
// - in a ship, it rides where the flat game's chase camera is, kept level.
//
// The rig is scaled so your eyes are at the robot's eyes, whatever your height (see render/xr-view.ts for what that
// costs). The left stick drives toward where you're looking, the right stick snap-turns, and the buttons press the
// same actions the keyboard does, so the legacy game moves the robot as it always has.
//
// Your hands are the robot's arms, and your head turns its head (app/vr-hands.ts): the legacy animation asks
// `poseArm`, `poseHead`, and `poseGrip` each frame, and grabs from the hand that gripped (`grabHand`). In VR its arms
// are long, your hands stretch out from your neck to match, and on the floor they can't go through it: they hold on
// and push the robot around, Gorilla Tag style (shared/sim/arm-locomotion.ts).
//
// More is coming: a wrist panel, comfort settings. See docs/initiatives/quest-vr.md.

/** What the legacy game lends VR mode. */
export interface VrGame {
  renderer: THREE.WebGLRenderer;
  /** The flat camera. In VR, ships still fly with it. */
  camera: THREE.PerspectiveCamera;
  /** The player's robot (the same object when it's rebuilt from new parts). */
  bot: Robot;
  /**
   * The legacy simulation state: the mode, the robot's heading, how high it's jumped, the Bot Maker roll-out, the spin
   * attack (-1 when not spinning), and the blaster's recoil (1 just after a shot).
   */
  st: {
    mode: string;
    yaw: number;
    y: number;
    vy: number;
    grounded: boolean;
    rollout: number;
    spin: number;
    recoil: number;
  };
  /** The held actions, and pressing one (which also marks it as just pressed for this frame). */
  keys: Record<string, boolean>;
  press(action: string): void;
  /** What the prompt line says right now, and whether it's only a hint (no button to press). */
  prompt(): {
    text: string;
    hint: boolean;
    /** What it's about, on the floor strip (a lift, an item), and the action touching its sign presses. */
    at?: { x: number; y: number; z: number } | null;
    action?: string;
  };
  drawTex: DrawTexFn;
  /** What robots are built from (for the Selfie's mini-me). */
  kit: RobotKit;
  /** The ships (app/flight.ts): the one being flown, for the cockpit, and its controls. */
  ships: Pick<FlightMode, 'cockpit' | 'setVrControls' | 'state'>;
}

export interface VrMode {
  /** Reads the headset and controllers, before the game updates. */
  beforeUpdate(dt: number, frame?: XRFrame): void;
  /** Draws the frame: through the headset in VR, or exactly as before through the flat camera. */
  draw(scene: THREE.Scene, flatCamera: THREE.Camera): void;
  /** Ends the VR session, if there is one, and goes back to the flat page. */
  leave(): void;
  /** Poses one of the robot's arms from your hand, in VR. Returns false when the legacy animation should pose it. */
  poseArm(arm: RobotArm): boolean;
  /** Turns the robot's head the way yours turns, in VR (after the legacy animation has turned it). */
  poseHead(): void;
  /** Puts what the robot holds in the hand holding it, and runs the haptics, in VR. */
  poseGrip(held: HeldItem | null, dt: number): void;
  /** In VR, the hand that just grabbed: where it reaches from, and whether it holds the item. Null when flat. */
  grabHand(): GrabHand | null;
  readonly presenting: boolean;
  /** Opens or puts away the Selfie's mini-me (app/vr-selfie.ts), in VR. */
  toggleSelfie(): void;
  readonly selfieOpen: boolean;
  /** For tests (`?debug`): the rig, its camera, the scale, the hands, and a point's place in your room. */
  readonly debug: {
    rig: THREE.Group;
    camera: THREE.PerspectiveCamera;
    scale: number;
    view: number;
    hands: ReturnType<typeof createVrHands>['hands'];
    pulses: string[];
    mini: ReturnType<typeof createMiniMe>;
    comfort: Comfort;
    vignette: number;
    wrist: ReturnType<typeof createWristPanel>;
    sign: ReturnType<typeof signPanel>;
    cockpit: ReturnType<typeof createCockpit>;
    drawn: { calls: number; triangles: number };
    /** Where a point in the robot's world (the floor strip, or real space) is in your room, in meters. */
    toPlay(p: { x: number; y: number; z: number }): { x: number; y: number; z: number };
    /** Where your hand goes (in your room, meters) for the robot's long arm to reach a point in your room. */
    handFor(p: { x: number; y: number; z: number }): { x: number; y: number; z: number };
    /** Where each hand holds on to the floor (in the robot's world), or null. */
    holds: readonly ({ x: number; y: number; z: number } | null)[];
    /** How far your hands stretch from your neck. */
    stretch: number;
  };
}

/**
 * Controller buttons (the xr-standard gamepad layout) and the game actions they press. The trigger (use) and grip
 * (grab) go through the hands (app/vr-hands.ts), since each hand grabs and uses on its own.
 */
const BUTTONS: { hand: 'left' | 'right' | 'either'; index: number; action: string }[] = [
  { hand: 'either', index: 4, action: 'jump' }, // A or X
  { hand: 'right', index: 5, action: 'spin' }, // B
  { hand: 'left', index: 3, action: 'boost' }, // pressing the left stick in
];
/** Y recenters: your eyes at the robot's eyes again, facing the way it faces. */
const RECENTER = { hand: 'left', index: 5 } as const;
/** Pressing the right stick in opens the Selfie's mini-me (until the wrist panel has a button for it). */
const SELFIE_BUTTON = { hand: 'right', index: 3 } as const;
/** Let go of the floor less than this high (scene units), and the robot just settles back on its wheel. */
const LANDED = 0.05;

const ORIGIN = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TURN_AROUND = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI);
/** In a ship's cockpit, the rig's scale (scene units per meter): the cockpit is a little roomy for a grown-up. */
const SHIP_RIG_SCALE = 1.4;
/** How fast the robot's arms grow long (or shrink back) as VR takes them over or hands them back, per second. */
const REACH_RATE = 6;

export function createVrMode(game: VrGame): VrMode {
  const { renderer, bot, st } = game;
  const hands = createVrHands(bot);
  const mini = createMiniMe(game.kit, bot);
  /** Whether each hand gripped last frame, and whether the Selfie button was down. */
  const wasGrab = [false, false];
  let selfieHeld = false;
  const xr = (navigator as Navigator & { xr?: XRSystem }).xr;
  renderer.xr.enabled = true;
  keepSpriteSizeInScaledViews();
  const drawScaled = createScaledViewDraw(renderer);

  // The rig is built on the first trip into VR, not at boot: three.js draws every new object's id from Math.random,
  // and the flat game's frames (and its tests) mustn't shift just because VR exists.
  let built: {
    rig: THREE.Group;
    camera: THREE.PerspectiveCamera;
    prompt: ReturnType<typeof promptPanel>;
    vignette: ReturnType<typeof vignettePanel>;
    wrist: ReturnType<typeof createWristPanel>;
    sign: ReturnType<typeof signPanel>;
    cockpit: ReturnType<typeof createCockpit>;
  } | null = null;
  function parts() {
    if (!built) {
      const rig = new THREE.Group();
      rig.name = 'vr-rig';
      const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 4000);
      rig.add(camera);
      const prompt = promptPanel(game.drawTex);
      camera.add(prompt.mesh);
      const vignette = vignettePanel(game.drawTex);
      camera.add(vignette.mesh);
      const wrist = createWristPanel(game.drawTex, comfort, saveComfort);
      rig.add(wrist.mesh);
      const sign = signPanel(game.drawTex);
      const cockpit = createCockpit();
      rig.add(cockpit.group);
      built = { rig, camera, prompt, vignette, wrist, sign, cockpit };
    }
    return built;
  }

  let session: XRSession | null = null;
  let space: XRReferenceSpace | null = null;
  /** Scene units per meter of play space. */
  let scale = 2;
  let calibrate = true;
  /** The heading your play space faces (see shared/sim/vr-rig.ts). On a lift or in a ship, an offset from its frame. */
  let view = 0;
  let snapArmed = true;
  let mode = '';
  /** Where your head is in the play space (meters), last frame, and where it was when the robot left the floor. */
  const head = new THREE.Vector3();
  const lastHead = new THREE.Vector3();
  const anchor = new THREE.Vector3();
  const headQ = new THREE.Quaternion();
  /** The actions VR is holding down, so it only lets go of its own. */
  const held = new Set<string>();
  let recenterHeld = false;

  /** What the robot held last frame (for eating), and whether the hands posed it this frame. */
  let holding: HeldItem | null = null;
  let posed = false;

  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();
  const m2 = new THREE.Matrix4();

  /** How high the robot's eye is above its wheel, in scene units. */
  function robotEyeHeight(): number {
    const eye = bot.eyeCore ?? bot.head;
    eye.getWorldPosition(v);
    bot.root.worldToLocal(v);
    return Math.max(v.y, 1);
  }

  /** Faces the way the robot faces (on the floor), or straight along its frame. */
  function faceRobot() {
    v.set(0, 0, -1).applyQuaternion(headQ);
    view = st.mode === 'floor' ? wrapAngle(st.yaw - headYaw(v.x, v.z)) : 0;
  }

  async function enter() {
    if (!xr || session) return;
    const s = await xr.requestSession('immersive-vr', {
      requiredFeatures: ['local-floor'],
      optionalFeatures: ['hand-tracking'],
    });
    await renderer.xr.setSession(s);
  }

  renderer.xr.addEventListener('sessionstart', () => {
    parts();
    session = renderer.xr.getSession();
    space = renderer.xr.getReferenceSpace();
    calibrate = true;
    mode = '';
    // render fewer pixels at the edges of each lens, where nobody looks (Quest)
    const layer = session?.renderState.baseLayer as { fixedFoveation?: number } | undefined;
    if (layer && 'fixedFoveation' in layer) layer.fixedFoveation = 1;
    // the player held the Meta button to recenter: measure them again
    space?.addEventListener('reset', () => {
      calibrate = true;
    });
  });
  renderer.xr.addEventListener('sessionend', () => {
    session = null;
    space = null;
    for (const arm of bot.arms) setArmReach(arm, 1);
    letGo();
    built?.rig.parent?.remove(built.rig);
    for (const a of held) game.keys[a] = false;
    held.clear();
    hands.release();
    mini.hide();
    built?.wrist.hide();
    built?.cockpit.leave();
    game.ships.setVrControls(null);
    built?.sign.mesh.parent?.remove(built.sign.mesh);
  });

  offerVr(document.getElementById('enter-vr') as HTMLButtonElement | null, xr, enter);
  // the comfort settings, set on the flat page until the wrist panel has them (ui/vr-comfort.ts)
  const comfort = loadComfort();
  const settings = comfortPanel(comfort);
  /** A hand touching the prompt's sign: whether one was last frame, and whether this frame's grab came from it. */
  let signTouched = false;
  let signGrab = false;
  let signKey = '';
  const perf = new URLSearchParams(location.search).has('perf');
  let fps = 72;

  /** The prompt's sign, when there is one: on the floor, about something (a lift, an item), with an action. */
  function signTarget() {
    const p = game.prompt();
    if (st.mode !== 'floor' || !p.at || p.hint || !p.text) return null;
    return { at: p.at, action: p.action ?? '', text: p.text };
  }

  /** What the wrist panel shows: the page HUD's text, what you're holding, and with ?perf the frame rate. */
  function wristInfo(dt: number) {
    const text = (id: string) => {
      const el = document.getElementById(id);
      return el && !el.hidden ? (el.textContent ?? '').trim() : '';
    };
    if (dt > 0) fps += (1 / dt - fps) * 0.05;
    const r = renderer.info.render;
    const name = (holding as { name?: string } | null)?.name ?? '';
    return {
      where: text('where'),
      station: text('station'),
      who: [text('who'), text('wallet')].filter(Boolean).join(' · '),
      holding: name,
      perf: perf ? `${fps.toFixed(0)} fps · ${r.calls} draws · ${(r.triangles / 1000).toFixed(0)}k tris` : undefined,
    };
  }
  xr?.isSessionSupported('immersive-vr').then(
    (ok) => ok && settings.show(),
    () => {},
  );
  /**
   * Arm locomotion: the hands on the floor, the glide after a fling (strip units per second), your eye height, your
   * neck (play space), how far your hands stretch from it, and this frame's step.
   */
  let loco = newArmLoco();
  let glideV = { x: 0, z: 0 };
  let eyeMeters = 1.5;
  const neck = new THREE.Vector3();
  let stretch: number = ARM_LOCO.stretch;
  let frameDt = 0;
  /** For the vignette: how fast the view turned and the robot moved last frame (radians, scene units per second). */
  let turnRate = 0;
  let speed = 0;
  /** In a ship: how fast it's turning (for the vignette), and the cooldown last frame (a shot resets it). */
  let shipTurn = 0;
  let lastCooldown = 0;
  const lastShip = { yaw: 0, pitch: 0 };
  const lastAt = new THREE.Vector3();
  let measured = false;

  function readInput(sources: Iterable<XRInputSource>) {
    const now = new Set<string>();
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let ry = 0;
    let recenter = false;
    let selfie = false;
    for (const src of sources) {
      const pad = src.gamepad;
      if (!pad || src.hand) continue; // a tracked hand has no buttons (app/vr-hands.ts reads its gestures)
      const down = (i: number) => !!pad.buttons[i]?.pressed;
      for (const b of BUTTONS)
        if ((b.hand === 'either' || b.hand === src.handedness) && down(b.index)) now.add(b.action);
      if (src.handedness === RECENTER.hand && down(RECENTER.index)) recenter = true;
      if (src.handedness === SELFIE_BUTTON.hand && down(SELFIE_BUTTON.index)) selfie = true;
      if (src.handedness === 'left') {
        lx = pad.axes[2] ?? 0;
        ly = pad.axes[3] ?? 0;
      } else if (src.handedness === 'right') {
        rx = pad.axes[2] ?? 0;
        ry = pad.axes[3] ?? 0;
      }
    }
    return { now, lx, ly, rx, ry, recenter, selfie };
  }

  /** Lets go of the floor, and stops any glide. A robot your hands held up off the floor falls. */
  function letGo() {
    loco = newArmLoco();
    glideV = { x: 0, z: 0 };
    if (st.y > 0 && st.grounded) st.grounded = false;
  }

  /** Where a point in your room (meters) is on the floor strip, with the robot standing under your head. */
  function roomToStrip(p: THREE.Vector3) {
    const P = bot.root.position;
    const d = rigToStrip(view, (p.x - head.x) * scale, (p.z - head.z) * scale);
    return { x: P.x + d.x, y: st.y + p.y * scale, z: P.z + d.z };
  }

  /**
   * Where the robot's long arm puts your hand on the floor strip: your stretched hand, kept within the arm's reach of
   * its shoulder, so a hand holds on only where the arm can reach, and pushing down further than that lifts the robot
   * no higher.
   */
  function handOnStrip(i: number) {
    const h = hands.hands[i];
    if (!h?.tracked) return null;
    const t = roomToStrip(h.reach);
    const arm = bot.arms[i];
    if (!arm) return t;
    const S = arm.shoulder.getWorldPosition(v);
    const long = ARM_LOCO.armLength / arm.reach;
    const reach =
      0.98 *
      ((arm.elbow.position.length() + arm.wrist.position.length()) * long +
        Math.abs(bot.grip.position.y) * arm.wrist.scale.y);
    const d = Math.hypot(t.x - S.x, t.y - S.y, t.z - S.z);
    if (d <= reach) return t;
    const k = reach / d;
    return { x: S.x + (t.x - S.x) * k, y: S.y + (t.y - S.y) * k, z: S.z + (t.z - S.z) * k };
  }

  /**
   * Arm locomotion on the floor (shared/sim/arm-locomotion.ts), Gorilla Tag style: your stretched hands can't go
   * through the floor, so a hand that reaches it holds on, and the robot moves against it (forward as you pull back,
   * up as you push down). Letting go flings it on, and letting go while it's rising fast jumps.
   */
  function armWalk(dt: number) {
    if (!comfort.armWalking) {
      letGo();
      return;
    }
    const pts = hands.hands.map((_, i) => handOnStrip(i));
    const step = armLocoStep(loco, pts, scale, dt);
    loco = step.state;
    step.touched.forEach((t, i) => {
      if (t) hands.pulse(i, 'floorTouch');
    });
    const p = bot.root.position;
    if (step.holding) {
      // your hands hold the robot up: no falling while they do (the legacy game's gravity waits for the floor)
      glideV = { x: 0, z: 0 };
      p.x += step.move.x;
      p.z += step.move.z;
      st.y += step.move.y;
      st.vy = 0;
      st.grounded = true;
      return;
    }
    if (step.fling) glideV = step.fling;
    if (step.jump !== undefined) {
      st.vy = step.jump;
      st.grounded = false;
    } else if (step.fling && st.y > 0) {
      // let go up off the floor: a little way just settles, any higher falls
      if (st.y < LANDED) st.y = 0;
      else st.grounded = false;
    }
    p.x += glideV.x * dt;
    p.z += glideV.z * dt;
    glideV = glide(glideV, dt, !st.grounded);
  }

  function beforeUpdate(dt: number, frame?: XRFrame) {
    frameDt = dt;
    if (!session || !space || !frame) return;
    const pose = frame.getViewerPose(space);
    if (!pose) return;
    const p = pose.transform.position;
    const o = pose.transform.orientation;
    head.set(p.x, p.y, p.z);
    headQ.set(o.x, o.y, o.z, o.w);
    v.set(0, 0, -1).applyQuaternion(headQ);
    const yaw = headYaw(v.x, v.z);

    if (calibrate) {
      // measure the player once the headset is on, so their eyes land at the robot's
      lastHead.copy(head);
      anchor.copy(head);
      if (head.y < MIN_HEAD_HEIGHT) return;
      scale = rigScale(robotEyeHeight(), head.y);
      eyeMeters = head.y;
      calibrate = false;
      faceRobot();
    }
    if (st.mode !== mode) {
      // a new frame to ride in (onto a lift, into a ship, back on the floor): start it facing the way the robot faces
      mode = st.mode;
      faceRobot();
      if (mode === 'ship') {
        parts().cockpit.sit(head);
        const ship = game.ships.state.ship;
        lastShip.yaw = ship.yaw;
        lastShip.pitch = ship.pitch;
        lastCooldown = ship.cooldown;
      } else built?.cockpit.leave();
      lastHead.copy(head);
      anchor.copy(head);
    }

    // how fast the robot went last frame, for the vignette: rolling or gliding across the floor, riding a lift, or
    // floating in the hub (stepping onto or off a lift, or round a lap of the ring, jumps too far to be speed)
    const at = bot.root.position;
    const moved = !measured
      ? 0
      : st.mode === 'floor'
        ? Math.hypot(at.x - lastAt.x, at.z - lastAt.z)
        : at.distanceTo(lastAt);
    speed = dt > 0 && moved < 5 && st.mode !== 'ship' ? moved / dt : 0;
    lastAt.copy(at);
    measured = true;

    const input = readInput(session.inputSources);
    // your hands stretch out from your neck, to the robot's long arms
    neck.copy(armPivot(head, eyeMeters));
    stretch = armStretch(comfort.seated);
    const fromHands = hands.input(session.inputSources, { frame, space, head, headQ, neck, stretch }, holding);
    /** Your hands where the robot's long arms put them: what they touch in the world (the mini-me, the wrist panel). */
    const reaching = hands.hands.map((h) => ({ pos: h.reach, quat: h.quat, grab: h.grab, tracked: h.tracked }));
    // the Selfie: the right stick in opens the mini-me, the right stick then turns it, and a hand can grip it
    if (input.selfie && !selfieHeld) mini.toggle(head, headQ);
    selfieHeld = input.selfie;
    const turning = mini.hands(reaching, wasGrab);
    hands.hands.forEach((h, i) => {
      wasGrab[i] = h.tracked && h.grab;
    });
    if (turning.size > 0 && hands.hands.every((h, i) => !h.grab || turning.has(i))) {
      fromHands.now.delete('grab');
      fromHands.fresh.delete('grab');
    }
    if (mini.open)
      mini.stick(
        Math.abs(input.rx) > STICK_DEADZONE ? input.rx : 0,
        Math.abs(input.ry) > STICK_DEADZONE ? input.ry : 0,
        dt,
      );
    // in a ship's cockpit: the hands on the joystick and throttle fly it, and their grips go no further
    const flying = st.mode === 'ship' ? game.ships.cockpit() : null;
    if (flying) {
      const { cockpit } = parts();
      const c = cockpit.update(hands.hands);
      for (const i of c.took) hands.pulse(i, 'pickUp');
      if (c.taken.size > 0 && hands.hands.every((h, i) => !h.grab || c.taken.has(i))) {
        fromHands.now.delete('grab');
        fromHands.fresh.delete('grab');
      }
      if (c.controls.fire) {
        fromHands.now.delete('use');
        fromHands.fresh.delete('use');
      }
      game.ships.setVrControls(c.controls);
      // a buzz in the stick's hand for each shot, and the vignette while the ship turns fast
      const ship = game.ships.state.ship;
      const stickHand = cockpit.holding.stick;
      if (stickHand !== null && ship.cooldown > lastCooldown + 1e-6) hands.pulse(stickHand, 'blasterKick', 0.4);
      lastCooldown = ship.cooldown;
      if (dt > 0)
        shipTurn = (Math.abs(wrapAngle(ship.yaw - lastShip.yaw)) + Math.abs(ship.pitch - lastShip.pitch)) / dt;
      lastShip.yaw = ship.yaw;
      lastShip.pitch = ship.pitch;
    } else {
      game.ships.setVrControls(null);
      shipTurn = 0;
    }
    for (const a of fromHands.now) input.now.add(a);
    if (input.recenter && !recenterHeld) calibrate = true;

    // the wrist panel: shows when the back of your left wrist faces you, and your right hand presses its buttons
    const wristDid = parts().wrist.update(reaching[0], reaching[1], head, wristInfo(dt));
    if (wristDid === 'selfie') mini.toggle(head, headQ);
    else if (wristDid === 'recenter') calibrate = true;
    else if (wristDid === 'exit') {
      session.end().catch(() => {});
      return;
    }

    // a hand touching the prompt's sign presses what the prompt says (once per touch)
    signGrab = false;
    const sign = signTarget();
    let touching = false;
    if (sign && built?.sign.mesh.visible) {
      // the sign, in your room (meters), where it was drawn last frame
      const at = built.rig.worldToLocal(v2.copy(built.sign.mesh.position));
      touching = hands.hands.some((h) => h.tracked && h.reach.distanceTo(at) < SIGN_REACH);
    }
    // a sign that just showed (or changed) only presses once a hand reaches in, not for a hand already there
    const key = sign ? `${sign.text}|${sign.action}` : '';
    if (key !== signKey) {
      signKey = key;
      signTouched = touching;
    }
    if (touching && !signTouched && sign?.action) {
      game.press(sign.action);
      signGrab = sign.action === 'grab';
    }
    signTouched = touching;
    recenterHeld = input.recenter;

    // turning: the view turns on the floor and in a ship; in the hub the robot turns, since it flies where it faces
    // (not while the right stick turns the mini-me). Snap turns by default, smooth with the comfort setting.
    // (no turning in a ship's cockpit: you fly by the stick, and look round with your head)
    const rx = mini.open || flying ? 0 : input.rx;
    const snap =
      comfort.turning === 'smooth' ? { view: smoothTurn(0, rx, dt), armed: true } : snapTurn(0, rx, snapArmed);
    snapArmed = snap.armed;
    turnRate = Math.max(comfort.turning === 'smooth' && dt > 0 ? Math.abs(snap.view / dt) : 0, shipTurn);
    if (snap.view !== 0) {
      if (st.mode === 'hub') {
        bot.root.quaternion.multiply(q.setFromAxisAngle(Y_AXIS, snap.view));
        st.yaw += snap.view;
      } else view = wrapAngle(view + snap.view);
    }

    const rolling = st.rollout > 0;
    if (rolling) letGo();
    if (st.mode === 'floor' && !rolling) {
      // stepping around the room moves the robot (bumping into things stops it, and the world holds you back), unless
      // you're seated, when leaning just moves your view
      if (!comfort.seated) {
        const step = rigToStrip(view, (head.x - lastHead.x) * scale, (head.z - lastHead.z) * scale);
        bot.root.position.x += step.x;
        bot.root.position.z += step.z;
      }
      armWalk(dt);
      // the left stick drives toward where you're looking: the robot turns to face the stick, then rolls
      const to = stickHeading(view + yaw, input.lx, input.ly);
      if (to !== undefined) {
        st.yaw = turnToward(st.yaw, to, VR_STEER_RATE * dt);
        if (Math.abs(wrapAngle(to - st.yaw)) < Math.PI / 2) input.now.add('up');
      }
    } else if (st.mode !== 'floor') {
      letGo();
      // on a lift, in the hub, or flying: the left stick works like the arrow keys
      if (input.ly < -STICK_DEADZONE) input.now.add('up');
      if (input.ly > STICK_DEADZONE) input.now.add('down');
      if (input.lx < -STICK_DEADZONE) input.now.add('left');
      if (input.lx > STICK_DEADZONE) input.now.add('right');
    }
    lastHead.copy(head);

    // a hand closing on an action the other hand already holds presses it again, as its own
    for (const a of fromHands.fresh) {
      game.keys[a] = false;
      game.press(a);
    }
    for (const a of input.now) if (!held.has(a)) game.press(a);
    for (const a of held) if (!input.now.has(a)) game.keys[a] = false;
    held.clear();
    for (const a of input.now) held.add(a);
  }

  /** Whether your hands and head pose the robot this frame (the legacy animation does while it spins, rolls out of
   * the Bot Maker, or flies a ship). */
  function driving(): boolean {
    return session !== null && !calibrate && st.mode !== 'ship' && st.rollout <= 0 && st.spin < 0;
  }

  /**
   * Where the play space sits in the robot root's frame, right now (the robot may have turned since the headset was
   * read): on the floor the robot stands under your head; on a lift or in the hub, under where you stood on boarding.
   */
  function rootFrame() {
    const floor = st.mode === 'floor';
    const turn = view + Math.PI - (floor ? st.yaw : 0);
    const base = floor ? head : anchor;
    hands.turnRoot.setFromAxisAngle(Y_AXIS, turn);
    hands.toRoot
      .makeRotationY(turn)
      .multiply(m.makeScale(scale, scale, scale))
      .multiply(m2.makeTranslation(-base.x, 0, -base.z));
    // on the floor, the hands rest on it (and hold on where they push); elsewhere there's no floor to stop them
    hands.ground.holds = floor ? loco.hold : [];
    hands.ground.floor = floor ? ARM_LOCO.handRest - bot.root.position.y : null;
  }

  function poseArm(arm: RobotArm): boolean {
    // the arms are long while your hands pose them, and as built while the legacy animation does
    const posing = driving() && !!hands.hands[bot.arms.indexOf(arm)]?.tracked;
    const want = posing ? ARM_LOCO.armLength : 1;
    const step = REACH_RATE * frameDt;
    const gap = want - arm.reach;
    setArmReach(arm, Math.abs(gap) <= step ? want : arm.reach + Math.sign(gap) * step);
    if (!posing) return false;
    if (!posed) {
      rootFrame();
      bot.root.updateMatrixWorld(true);
      posed = true;
    }
    return hands.poseArm(arm);
  }

  function poseHead() {
    if (!driving()) return;
    rootFrame();
    hands.poseHead(headQ);
  }

  function poseGrip(item: HeldItem | null, dt: number) {
    posed = false;
    if (!session) return;
    holding = item;
    if (!driving()) {
      hands.idle(item);
      return;
    }
    rootFrame();
    hands.poseGrip(item, dt, st.recoil);
  }

  /** Puts the rig where the robot's eye is, for this frame. */
  function placeRig(rig: THREE.Group) {
    if (st.mode === 'floor') {
      const P = bot.root.position;
      bendPoint(v2.set(P.x, st.y, P.z), rig.position);
      rig.quaternion.setFromAxisAngle(X_AXIS, -P.z / R_IN).multiply(q.setFromAxisAngle(Y_AXIS, view + Math.PI));
      rig.position.sub(v.set(head.x * scale, 0, head.z * scale).applyQuaternion(rig.quaternion));
    } else if (st.mode === 'ship' && game.ships.cockpit()) {
      // in the pilot's seat: the rig rides in the ship's body, its nose ahead of you, your eyes at the pilot's
      const { model } = game.ships.cockpit() as NonNullable<ReturnType<FlightMode['cockpit']>>;
      model.body.updateMatrixWorld(true);
      model.body.getWorldQuaternion(rig.quaternion).multiply(TURN_AROUND);
      model.body.localToWorld(v2.set(PILOT_EYE.x, PILOT_EYE.y, PILOT_EYE.z));
      rig.position.copy(v2).sub(v.copy(anchor).multiplyScalar(SHIP_RIG_SCALE).applyQuaternion(rig.quaternion));
      rig.scale.setScalar(SHIP_RIG_SCALE);
      rig.updateMatrixWorld(true);
      return;
    } else if (st.mode === 'ship') {
      // ride where the chase camera is, level with its "up"
      const cam = game.camera;
      v.set(0, 0, -1).applyQuaternion(cam.quaternion);
      const up = v2.copy(cam.up).normalize();
      v.addScaledVector(up, -v.dot(up)).normalize();
      rig.quaternion.setFromRotationMatrix(m.lookAt(ORIGIN, v, up)).multiply(q.setFromAxisAngle(Y_AXIS, view));
      rig.position.copy(cam.position).sub(v.copy(anchor).multiplyScalar(scale).applyQuaternion(rig.quaternion));
    } else {
      // real space: the robot's own frame (its +z is forward; the play space looks along -z)
      rig.quaternion.copy(bot.root.quaternion).multiply(TURN_AROUND).multiply(q.setFromAxisAngle(Y_AXIS, view));
      rig.position
        .copy(bot.root.position)
        .sub(v.set(anchor.x * scale, 0, anchor.z * scale).applyQuaternion(rig.quaternion));
    }
    rig.scale.setScalar(scale);
    rig.updateMatrixWorld(true);
  }

  function draw(scene: THREE.Scene, flatCamera: THREE.Camera) {
    if (!session) {
      renderer.render(scene, flatCamera);
      return;
    }
    const { rig, camera, prompt, vignette } = parts();
    placeRig(rig);
    // the comfort vignette closes in while you move fast or turn smoothly
    vignette.show(vignetteAmount(comfort.vignette, speed, turnRate));
    // the prompt: a sign beside what it's about (on the floor), or the line floating below your view
    const { text, hint } = game.prompt();
    const { sign } = parts();
    const target = signTarget();
    if (target) {
      if (sign.mesh.parent !== scene) scene.add(sign.mesh);
      sign.show(target.text, target.at, camera);
      prompt.show('', true);
    } else {
      sign.hide();
      prompt.show(text, hint);
    }
    if (rig.parent !== scene) scene.add(rig);
    mini.draw(scene, rig, scale, robotEyeHeight() * SELFIE.miniMiddle);
    // in first person you see only your robot's arms and what it holds: its head, body, and wheel would block the
    // view, so they aren't drawn for you (everyone else still sees them, and so does the Selfie)
    const hidden: THREE.Object3D[] = firstPersonHidden(bot);
    // in the cockpit, you sit where the little alien pilot does
    if (st.mode === 'ship') hidden.push(...(game.ships.cockpit()?.model.pilot ?? []));
    const shown = hidden.map((o) => o.visible);
    for (const o of hidden) o.visible = false;
    // only what's in view of the headset is drawn: bent things are culled by their bent bounds (render/ring/bent-cull.ts)
    const showCulled = cullBent(scene, renderer.xr.getCamera());
    try {
      drawScaled(scene, camera, 1 / rig.scale.x);
    } finally {
      showCulled();
      hidden.forEach((o, i) => {
        o.visible = shown[i] as boolean;
      });
    }
  }

  return {
    beforeUpdate,
    draw,
    poseArm,
    poseHead,
    poseGrip,
    grabHand: () => (driving() && !signGrab ? hands.grabHand() : null),
    leave() {
      session?.end().catch(() => {});
    },
    get presenting() {
      return session !== null;
    },
    toggleSelfie() {
      if (session) mini.toggle(head, headQ);
    },
    get selfieOpen() {
      return mini.open;
    },
    debug: {
      get rig() {
        return parts().rig;
      },
      get camera() {
        return parts().camera;
      },
      get scale() {
        return scale;
      },
      get view() {
        return view;
      },
      hands: hands.hands,
      pulses: hands.pulses,
      mini,
      comfort,
      get vignette() {
        return parts().vignette.amount;
      },
      get wrist() {
        return parts().wrist;
      },
      get sign() {
        return parts().sign;
      },
      get cockpit() {
        return parts().cockpit;
      },
      /** What the last frame drew: draw calls and triangles (both eyes). */
      get drawn() {
        const r = renderer.info.render;
        return { calls: r.calls, triangles: r.triangles };
      },
      toPlay(p: { x: number; y: number; z: number }) {
        rootFrame();
        bot.root.updateMatrixWorld(true);
        const r = bot.root.worldToLocal(new THREE.Vector3(p.x, p.y, p.z));
        const out = r.applyMatrix4(m.copy(hands.toRoot).invert());
        return { x: out.x, y: out.y, z: out.z };
      },
      handFor(p: { x: number; y: number; z: number }) {
        return shortArm(p, neck, stretch);
      },
      get holds() {
        return loco.hold;
      },
      get stretch() {
        return stretch;
      },
    } as VrMode['debug'],
  };
}

/** The prompt line ("Ride lift 2 up to the hub"), floating low in front of you, since the page's HUD can't be seen. */
function promptPanel(drawTex: DrawTexFn) {
  let shown = '';
  let line = '';
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    if (!line) return;
    g.font = '500 44px "IBM Plex Mono", ui-monospace, monospace';
    const tw = Math.min(w - 8, g.measureText(line).width + 64);
    g.fillStyle = 'rgba(34, 29, 26, 0.78)';
    g.beginPath();
    g.roundRect((w - tw) / 2, 4, tw, h - 8, (h - 8) / 2);
    g.fill();
    g.fillStyle = '#f1eadf';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(line, w / 2, h / 2 + 2);
  };
  const tex = drawTex(1024, 96, paint);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    depthTest: false,
    fog: false,
    toneMapped: false,
  });
  // 1.2 m wide, 1.3 m out and a little below your eyes (in play-space meters: the camera's units)
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1.2, 1.2 * (96 / 1024)), mat);
  mesh.position.set(0, -0.32, -1.3);
  mesh.renderOrder = 20;
  mesh.frustumCulled = false;
  mesh.visible = false;
  return {
    mesh,
    show(text: string, hint: boolean) {
      const next = text ? (hint ? text : `Grip · ${text}`) : '';
      if (next === shown) return;
      shown = next;
      line = next;
      const c = tex.image as HTMLCanvasElement;
      const g = c.getContext('2d');
      if (g) paint(g, c.width, c.height);
      tex.needsUpdate = true;
      mesh.visible = !!next;
    },
  };
}

/** The comfort vignette: a dark ring round the edge of your view, see-through in the middle. */
function vignettePanel(drawTex: DrawTexFn) {
  const tex = drawTex(256, 256, (g, w, h) => {
    const r = g.createRadialGradient(w / 2, h / 2, w * 0.18, w / 2, h / 2, w * 0.5);
    r.addColorStop(0, 'rgba(0,0,0,0)');
    r.addColorStop(1, 'rgba(0,0,0,1)');
    g.fillStyle = r;
    g.fillRect(0, 0, w, h);
  });
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity: 0,
    depthTest: false,
    depthWrite: false,
    fog: false,
    toneMapped: false,
  });
  // in camera space (meters), close in front of your eyes and wide enough to cover both lenses' view
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat);
  mesh.position.set(0, 0, -0.2);
  mesh.renderOrder = 30;
  mesh.frustumCulled = false;
  mesh.visible = false;
  let amount = 0;
  return {
    mesh,
    get amount() {
      return amount;
    },
    show(a: number) {
      amount = a;
      mat.opacity = a;
      mesh.visible = a > 0.01;
    },
  };
}

/**
 * The prompt as a sign in the world (VR), floating beside what it's about and turned to face you: "Grip · Ride lift 2
 * up to the hub" over the lift. Touching it with a hand does what it says. Drawn as-is (not bent), at its bent place.
 */
function signPanel(drawTex: DrawTexFn) {
  let line = '';
  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    if (!line) return;
    g.font = '600 44px "IBM Plex Mono", ui-monospace, monospace';
    const tw = Math.min(w - 8, g.measureText(line).width + 64);
    g.fillStyle = 'rgba(34, 29, 26, 0.85)';
    g.beginPath();
    g.roundRect((w - tw) / 2, 4, tw, h - 8, 20);
    g.fill();
    g.strokeStyle = '#b8642c';
    g.lineWidth = 4;
    g.stroke();
    g.fillStyle = '#f1eadf';
    g.textAlign = 'center';
    g.textBaseline = 'middle';
    g.fillText(line, w / 2, h / 2 + 2, w - 40);
  };
  const tex = drawTex(1024, 112, paint);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    fog: false,
    toneMapped: false,
    depthWrite: false,
  });
  // in scene units: about 1.5 m wide at a grown-up's rig scale
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(3, 3 * (112 / 1024)), mat);
  mesh.name = 'vr-sign';
  mesh.renderOrder = 15;
  mesh.frustumCulled = false;
  mesh.visible = false;
  const eye = new THREE.Vector3();
  return {
    mesh,
    get text() {
      return mesh.visible ? line : '';
    },
    show(text: string, at: { x: number; y: number; z: number }, camera: THREE.Camera) {
      const next = `Grip · ${text}`;
      if (next !== line) {
        line = next;
        const c = tex.image as HTMLCanvasElement;
        const g = c.getContext('2d');
        if (g) paint(g, c.width, c.height);
        tex.needsUpdate = true;
      }
      bendPoint(at, mesh.position);
      bendUp(at.z, mesh.up);
      camera.getWorldPosition(eye);
      mesh.lookAt(eye);
      mesh.visible = true;
    },
    hide() {
      mesh.visible = false;
    },
  };
}

import {
  bendPoint,
  headYaw,
  MIN_HEAD_HEIGHT,
  R_IN,
  rigScale,
  rigToStrip,
  STICK_DEADZONE,
  snapTurn,
  stickHeading,
  turnToward,
  VR_STEER_RATE,
  wrapAngle,
} from '@saber-side/shared';
import type { XR, XRFrame, XRInputSource, XRReferenceSpace, XRSession } from 'three';
import * as THREE from 'three';
import type { Robot } from '../avatar/robot';
import type { DrawTexFn } from '../render/kit';
import { createScaledViewDraw, keepSpriteSizeInScaledViews } from '../render/xr-view';
import { offerVr } from '../ui/enter-vr';

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
// More is coming: your hands as the robot's arms, a wrist panel, comfort settings. See
// docs/initiatives/quest-vr.md.

/** What the legacy game lends VR mode. */
export interface VrGame {
  renderer: THREE.WebGLRenderer;
  /** The flat camera. In VR, ships still fly with it. */
  camera: THREE.PerspectiveCamera;
  /** The player's robot (the same object when it's rebuilt from new parts). */
  bot: Robot;
  /** The legacy simulation state: the mode, the robot's heading, how high it's jumped, and the Bot Maker roll-out. */
  st: { mode: string; yaw: number; y: number; rollout: number };
  /** The held actions, and pressing one (which also marks it as just pressed for this frame). */
  keys: Record<string, boolean>;
  press(action: string): void;
  /** What the prompt line says right now, and whether it's only a hint (no button to press). */
  prompt(): { text: string; hint: boolean };
  drawTex: DrawTexFn;
}

export interface VrMode {
  /** Reads the headset and controllers, before the game updates. */
  beforeUpdate(dt: number, frame?: XRFrame): void;
  /** Draws the frame: through the headset in VR, or exactly as before through the flat camera. */
  draw(scene: THREE.Scene, flatCamera: THREE.Camera): void;
  /** Ends the VR session, if there is one, and goes back to the flat page. */
  leave(): void;
  readonly presenting: boolean;
  /** For tests (`?debug`): the rig, its camera, and the scale. */
  readonly debug: { rig: THREE.Group; camera: THREE.PerspectiveCamera; scale: number; view: number };
}

/** Controller buttons (the xr-standard gamepad layout) and the game actions they press. */
const BUTTONS: { hand: 'left' | 'right' | 'either'; index: number; action: string }[] = [
  { hand: 'either', index: 0, action: 'use' }, // trigger
  { hand: 'either', index: 1, action: 'grab' }, // grip
  { hand: 'either', index: 4, action: 'jump' }, // A or X
  { hand: 'right', index: 5, action: 'spin' }, // B
  { hand: 'left', index: 3, action: 'boost' }, // pressing the left stick in
];
/** Y recenters: your eyes at the robot's eyes again, facing the way it faces. */
const RECENTER = { hand: 'left', index: 5 } as const;

const ORIGIN = new THREE.Vector3();
const X_AXIS = new THREE.Vector3(1, 0, 0);
const Y_AXIS = new THREE.Vector3(0, 1, 0);
const TURN_AROUND = new THREE.Quaternion().setFromAxisAngle(Y_AXIS, Math.PI);

export function createVrMode(game: VrGame): VrMode {
  const { renderer, bot, st } = game;
  const xr = (navigator as Navigator & { xr?: XR }).xr;
  renderer.xr.enabled = true;
  keepSpriteSizeInScaledViews();
  const drawScaled = createScaledViewDraw(renderer);

  // The rig is built on the first trip into VR, not at boot: three.js draws every new object's id from Math.random,
  // and the flat game's frames (and its tests) mustn't shift just because VR exists.
  let built: { rig: THREE.Group; camera: THREE.PerspectiveCamera; prompt: ReturnType<typeof promptPanel> } | null =
    null;
  function parts() {
    if (!built) {
      const rig = new THREE.Group();
      rig.name = 'vr-rig';
      const camera = new THREE.PerspectiveCamera(70, 1, 0.05, 4000);
      rig.add(camera);
      const prompt = promptPanel(game.drawTex);
      camera.add(prompt.mesh);
      built = { rig, camera, prompt };
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

  const v = new THREE.Vector3();
  const v2 = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const m = new THREE.Matrix4();

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
    built?.rig.parent?.remove(built.rig);
    for (const a of held) game.keys[a] = false;
    held.clear();
  });

  offerVr(document.getElementById('enter-vr') as HTMLButtonElement | null, xr, enter);

  function readInput(sources: readonly XRInputSource[]) {
    const now = new Set<string>();
    let lx = 0;
    let ly = 0;
    let rx = 0;
    let recenter = false;
    for (const src of sources) {
      const pad = src.gamepad;
      if (!pad) continue;
      const down = (i: number) => !!pad.buttons[i]?.pressed;
      for (const b of BUTTONS)
        if ((b.hand === 'either' || b.hand === src.handedness) && down(b.index)) now.add(b.action);
      if (src.handedness === RECENTER.hand && down(RECENTER.index)) recenter = true;
      if (src.handedness === 'left') {
        lx = pad.axes[2] ?? 0;
        ly = pad.axes[3] ?? 0;
      } else if (src.handedness === 'right') rx = pad.axes[2] ?? 0;
    }
    return { now, lx, ly, rx, recenter };
  }

  function beforeUpdate(dt: number, frame?: XRFrame) {
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
      calibrate = false;
      faceRobot();
    }
    if (st.mode !== mode) {
      // a new frame to ride in (onto a lift, into a ship, back on the floor): start it facing the way the robot faces
      mode = st.mode;
      faceRobot();
      lastHead.copy(head);
      anchor.copy(head);
    }

    const input = readInput(session.inputSources);
    if (input.recenter && !recenterHeld) calibrate = true;
    recenterHeld = input.recenter;

    // snap turns: the view turns on the floor and in a ship; in the hub the robot turns, since it flies where it faces
    const snap = snapTurn(0, input.rx, snapArmed);
    snapArmed = snap.armed;
    if (snap.view !== 0) {
      if (st.mode === 'hub') {
        bot.root.quaternion.multiply(q.setFromAxisAngle(Y_AXIS, snap.view));
        st.yaw += snap.view;
      } else view = wrapAngle(view + snap.view);
    }

    const rolling = st.rollout > 0;
    if (st.mode === 'floor' && !rolling) {
      // stepping around the room moves the robot (bumping into things stops it, and the world holds you back)
      const step = rigToStrip(view, (head.x - lastHead.x) * scale, (head.z - lastHead.z) * scale);
      bot.root.position.x += step.x;
      bot.root.position.z += step.z;
      // the left stick drives toward where you're looking: the robot turns to face the stick, then rolls
      const to = stickHeading(view + yaw, input.lx, input.ly);
      if (to !== undefined) {
        st.yaw = turnToward(st.yaw, to, VR_STEER_RATE * dt);
        if (Math.abs(wrapAngle(to - st.yaw)) < Math.PI / 2) input.now.add('up');
      }
    } else if (st.mode !== 'floor') {
      // on a lift, in the hub, or flying: the left stick works like the arrow keys
      if (input.ly < -STICK_DEADZONE) input.now.add('up');
      if (input.ly > STICK_DEADZONE) input.now.add('down');
      if (input.lx < -STICK_DEADZONE) input.now.add('left');
      if (input.lx > STICK_DEADZONE) input.now.add('right');
    }
    lastHead.copy(head);

    for (const a of input.now) if (!held.has(a)) game.press(a);
    for (const a of held) if (!input.now.has(a)) game.keys[a] = false;
    held.clear();
    for (const a of input.now) held.add(a);
  }

  /** Puts the rig where the robot's eye is, for this frame. */
  function placeRig(rig: THREE.Group) {
    if (st.mode === 'floor') {
      const P = bot.root.position;
      bendPoint(v2.set(P.x, st.y, P.z), rig.position);
      rig.quaternion.setFromAxisAngle(X_AXIS, -P.z / R_IN).multiply(q.setFromAxisAngle(Y_AXIS, view + Math.PI));
      rig.position.sub(v.set(head.x * scale, 0, head.z * scale).applyQuaternion(rig.quaternion));
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
    const { rig, camera, prompt } = parts();
    placeRig(rig);
    const { text, hint } = game.prompt();
    prompt.show(text, hint);
    if (rig.parent !== scene) scene.add(rig);
    // you're inside the robot's head, so it isn't drawn for you (everyone else still sees it)
    const headShown = bot.head.visible;
    bot.head.visible = false;
    try {
      drawScaled(scene, camera, 1 / scale);
    } finally {
      bot.head.visible = headShown;
    }
  }

  return {
    beforeUpdate,
    draw,
    leave() {
      session?.end().catch(() => {});
    },
    get presenting() {
      return session !== null;
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

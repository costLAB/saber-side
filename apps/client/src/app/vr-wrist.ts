import {
  type Comfort,
  hitButton,
  pressEdge,
  type Rect,
  touchSpot,
  VIGNETTE_STEPS,
  WRIST,
  wristFacing,
} from '@saber-side/shared';
import * as THREE from 'three';
import type { DrawTexFn } from '../render/kit';

// The wrist panel (quest-vr PR 3): the HUD on the back of your left wrist, since the page's HUD can't be seen in a
// headset. Turn the back of your wrist toward your eyes and it shows; press a button on it with your right hand.
//
// - The main page: where you are, the station's status, who you're playing as and your wallet, what you're holding,
//   the frame rate with `?perf`, and Selfie, Comfort, and Exit VR.
// - The comfort page: turning, the vignette, seated mode, moving with your arms or the stick, Recenter, and Back.
//
// It's a canvas texture, redrawn only when its text changes. The rules (facing, touching, pressing) are in
// shared/sim/vr-wrist.ts.

/** What the panel shows, read each frame. */
export interface WristInfo {
  where: string;
  station: string;
  who: string;
  holding: string;
  /** With `?perf`: the frame rate, draw calls, and triangles. */
  perf?: string;
}

interface Button {
  id: string;
  label: string;
  rect: Rect;
  on?: boolean;
}

const W = 576;
const H = 384;

export type WristAction = 'selfie' | 'exit' | 'recenter';

/** The pose of a hand, in the play space (meters). */
interface HandPose {
  pos: THREE.Vector3;
  quat: THREE.Quaternion;
  tracked: boolean;
}

const BACK_OF_WRIST = new THREE.Vector3(0, 0.045, 0.1);
const FACE_UP = new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(1, 0, 0), -Math.PI / 2);

export function createWristPanel(drawTex: DrawTexFn, comfort: Comfort, saveComfort: (c: Comfort) => void) {
  let page: 'main' | 'comfort' = 'main';
  let buttons: Button[] = [];
  let lines: string[] = [];
  let drawn = '';
  let shown = false;
  let armed = true;

  const paint = (g: CanvasRenderingContext2D, w: number, h: number) => {
    g.clearRect(0, 0, w, h);
    g.fillStyle = 'rgba(34, 29, 26, 0.9)';
    g.beginPath();
    g.roundRect(4, 4, w - 8, h - 8, 28);
    g.fill();
    g.strokeStyle = '#b8642c';
    g.lineWidth = 4;
    g.stroke();
    g.textBaseline = 'middle';
    g.textAlign = 'left';
    lines.forEach((line, i) => {
      g.font =
        i === 0
          ? '700 34px "IBM Plex Mono", ui-monospace, monospace'
          : '500 26px "IBM Plex Mono", ui-monospace, monospace';
      g.fillStyle = i === 0 ? '#f1eadf' : '#cbbfae';
      g.fillText(line, 30, 42 + i * 38, w - 60);
    });
    for (const b of buttons) {
      const x = b.rect.u * w;
      const y = b.rect.v * h;
      const bw = b.rect.w * w;
      const bh = b.rect.h * h;
      g.fillStyle = b.id === 'exit' ? '#b8642c' : b.on ? '#5d6a72' : 'rgba(228, 220, 205, 0.18)';
      g.beginPath();
      g.roundRect(x, y, bw, bh, 14);
      g.fill();
      g.fillStyle = '#f1eadf';
      g.font = '700 24px "IBM Plex Mono", ui-monospace, monospace';
      g.textAlign = 'center';
      g.fillText(b.label, x + bw / 2, y + bh / 2 + 1, bw - 12);
      g.textAlign = 'left';
    }
  };
  const tex = drawTex(W, H, paint);
  const mat = new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, toneMapped: false });
  const mesh = new THREE.Mesh(new THREE.PlaneGeometry(WRIST.width, WRIST.height), mat);
  mesh.name = 'wrist-panel';
  mesh.renderOrder = 25;
  mesh.frustumCulled = false;
  mesh.visible = false;

  function layout(info: WristInfo) {
    if (page === 'main') {
      lines = [
        info.where || 'Ring Seven',
        info.station,
        info.who,
        info.holding ? `Holding: ${info.holding}` : 'Hands free',
      ];
      if (info.perf) lines.push(info.perf);
      buttons = [
        { id: 'selfie', label: 'Selfie', rect: { u: 0.05, v: 0.76, w: 0.27, h: 0.18 } },
        { id: 'comfort', label: 'Comfort', rect: { u: 0.365, v: 0.76, w: 0.27, h: 0.18 } },
        { id: 'exit', label: 'Exit VR', rect: { u: 0.68, v: 0.76, w: 0.27, h: 0.18 } },
      ];
    } else {
      const vig = (Object.entries(VIGNETTE_STEPS).find(([, v]) => v === comfort.vignette)?.[0] ?? 'low') as string;
      lines = ['Comfort'];
      buttons = [
        { id: 'turning', label: `Turn: ${comfort.turning}`, rect: { u: 0.05, v: 0.2, w: 0.43, h: 0.17 } },
        { id: 'vignette', label: `Vignette: ${vig}`, rect: { u: 0.52, v: 0.2, w: 0.43, h: 0.17 } },
        {
          id: 'seated',
          label: `Seated: ${comfort.seated ? 'on' : 'off'}`,
          rect: { u: 0.05, v: 0.42, w: 0.43, h: 0.17 },
          on: comfort.seated,
        },
        {
          id: 'arms',
          label: `Move: ${comfort.armWalking ? 'arms' : 'stick'}`,
          rect: { u: 0.52, v: 0.42, w: 0.43, h: 0.17 },
          on: comfort.armWalking,
        },
        { id: 'recenter', label: 'Recenter', rect: { u: 0.05, v: 0.76, w: 0.43, h: 0.18 } },
        { id: 'back', label: 'Back', rect: { u: 0.52, v: 0.76, w: 0.43, h: 0.18 } },
      ];
    }
    const key = JSON.stringify([lines, buttons.map((b) => b.label)]);
    if (key === drawn) return;
    drawn = key;
    const c = tex.image as HTMLCanvasElement;
    const g = c.getContext('2d');
    if (g) paint(g, c.width, c.height);
    tex.needsUpdate = true;
  }

  /** Acts on a button: the panel's own (pages, comfort settings), or one VR mode handles (returned). */
  function act(id: string): WristAction | null {
    switch (id) {
      case 'comfort':
        page = 'comfort';
        return null;
      case 'back':
        page = 'main';
        return null;
      case 'turning':
        comfort.turning = comfort.turning === 'snap' ? 'smooth' : 'snap';
        break;
      case 'vignette': {
        const steps = Object.values(VIGNETTE_STEPS) as number[];
        const i = steps.indexOf(comfort.vignette);
        comfort.vignette = steps[(i + 1) % steps.length] as number;
        break;
      }
      case 'seated':
        comfort.seated = !comfort.seated;
        break;
      case 'arms':
        comfort.armWalking = !comfort.armWalking;
        break;
      case 'selfie':
      case 'exit':
      case 'recenter':
        return id;
    }
    saveComfort(comfort);
    return null;
  }

  const v = new THREE.Vector3();
  const n = new THREE.Vector3();
  const m = new THREE.Matrix4();

  return {
    mesh,
    /** For tests. */
    get page() {
      return page;
    },
    get lines() {
      return lines;
    },
    get shown() {
      return shown;
    },
    /** Where a button's middle is, in the play space (meters), for tests. */
    buttonAt(id: string) {
      const b = buttons.find((x) => x.id === id);
      if (!b) return null;
      const lx = (b.rect.u + b.rect.w / 2 - 0.5) * WRIST.width;
      const ly = (0.5 - (b.rect.v + b.rect.h / 2)) * WRIST.height;
      mesh.updateMatrix();
      const p = v.set(lx, ly, 0).applyMatrix4(mesh.matrix);
      return { x: p.x, y: p.y, z: p.z };
    },
    /**
     * Places the panel on the back of your left wrist, shows it when it faces you, and presses whatever your right
     * fingertip touches. Returns what VR mode should do, if anything.
     */
    update(left: HandPose | undefined, right: HandPose | undefined, head: THREE.Vector3, info: WristInfo) {
      if (!left?.tracked) {
        shown = false;
        mesh.visible = false;
        return null;
      }
      mesh.position.copy(BACK_OF_WRIST).applyQuaternion(left.quat).add(left.pos);
      mesh.quaternion.copy(left.quat).multiply(FACE_UP);
      n.set(0, 0, 1).applyQuaternion(mesh.quaternion);
      shown = wristFacing(n, mesh.position, head, shown);
      mesh.visible = shown;
      if (!shown) {
        armed = true;
        return null;
      }
      layout(info);
      if (!right?.tracked) return null;
      // the fingertip, a little ahead of the right hand's grip, in the panel's frame
      v.set(0, 0, -WRIST.tipAhead).applyQuaternion(right.quat).add(right.pos);
      mesh.updateMatrix();
      const local = v.applyMatrix4(m.copy(mesh.matrix).invert());
      const hit = hitButton(touchSpot(local), buttons);
      const edge = pressEdge(armed, hit?.id ?? null, local.z);
      armed = edge.armed;
      if (!edge.press) return null;
      const out = act(edge.press);
      layout(info);
      return out;
    },
    hide() {
      shown = false;
      mesh.visible = false;
      page = 'main';
    },
  };
}

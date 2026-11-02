import { PLANTED } from '@saber-side/shared';
import * as THREE from 'three';

// The carrot beds on the ring farms (shared content/carrot-beds.ts), and the carrots a spin kicks out of them.
//
// Thousands of carrots are planted, so the beds are two instanced meshes (the orange shoulders poking out of the soil,
// and their leaves), one draw each. A picked carrot is scaled to nothing, and grows back by scaling up again.
//
// A kicked-up carrot is a loose item like the one on the table, but lighter: two meshes on shared geometry, since up
// to LOOSE_MAX of them can lie about at once.

export interface CarrotBedsScene {
  /** Both instanced meshes. Add it to the (bent) scene. */
  root: THREE.Group;
  /** How grown planted carrot `i` is: 0 (picked, nothing shows) to 1 (ripe). */
  setGrowth(i: number, k: number): void;
}

/** The materials carrots are drawn with: the legacy game's own, so they match the table carrot. */
export interface CarrotLook {
  carrot: THREE.Material;
  leaf: THREE.Material;
}

/** Joins geometries into one (positions and normals only: carrots aren't textured). */
function merge(parts: THREE.BufferGeometry[]): THREE.BufferGeometry {
  const pos: number[] = [];
  const nor: number[] = [];
  for (const p of parts) {
    const flat = p.index ? p.toNonIndexed() : p;
    pos.push(...(flat.getAttribute('position').array as Float32Array));
    nor.push(...(flat.getAttribute('normal').array as Float32Array));
    if (flat !== p) flat.dispose();
    p.dispose();
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(nor, 3));
  return g;
}

/** A tuft of `n` leaves fanning out from the origin, along +y (or -y, with `down`). */
function tuft(n: number, r: number, h: number, splay: number, down = false) {
  const leaves: THREE.BufferGeometry[] = [];
  for (let i = 0; i < n; i++) {
    const g = new THREE.ConeGeometry(r, h, 5);
    g.translate(0, h / 2, 0);
    const a = (i / n) * Math.PI * 2 + 0.4;
    g.applyMatrix4(
      new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(Math.cos(a) * splay, 0, Math.sin(a) * splay)),
    );
    if (down) g.rotateX(Math.PI);
    leaves.push(g);
  }
  return merge(leaves);
}

export function buildCarrotBeds(look: CarrotLook): CarrotBedsScene {
  const root = new THREE.Group();
  // The shoulder: the top of the root, poking out of the soil.
  const shoulderGeo = new THREE.ConeGeometry(0.08, 0.24, 8);
  shoulderGeo.rotateX(Math.PI);
  shoulderGeo.translate(0, 0.05, 0);
  const leafGeo = tuft(3, 0.035, 0.36, 0.38);
  leafGeo.translate(0, 0.1, 0);
  const shoulders = new THREE.InstancedMesh(shoulderGeo, look.carrot, PLANTED.length);
  const leaves = new THREE.InstancedMesh(leafGeo, look.leaf, PLANTED.length);
  for (const m of [shoulders, leaves]) {
    m.castShadow = false;
    m.receiveShadow = true;
    root.add(m);
  }
  const dummy = new THREE.Object3D();
  const place = (i: number, k: number) => {
    const c = PLANTED[i];
    if (!c) return;
    dummy.position.set(c.x, 0, c.z);
    dummy.rotation.set(0, c.turn, 0);
    dummy.scale.setScalar(Math.max(k, 1e-4));
    dummy.updateMatrix();
    shoulders.setMatrixAt(i, dummy.matrix);
    leaves.setMatrixAt(i, dummy.matrix);
  };
  for (let i = 0; i < PLANTED.length; i++) place(i, 1);
  return {
    root,
    setGrowth(i, k) {
      place(i, k);
      shoulders.instanceMatrix.needsUpdate = true;
      leaves.instanceMatrix.needsUpdate = true;
    },
  };
}

/** A carrot kicked out of a bed, built like the legacy game's items: along +y, its grip at the origin. */
export interface LooseCarrot {
  kind: 'carrot';
  name: string;
  group: THREE.Group;
  /** Shrinks as it's bitten. */
  body: THREE.Group;
  bites: number;
  /** How high its middle rests above the floor, lying on its side. */
  rest: number;
}

let shared: { root: THREE.BufferGeometry; leaves: THREE.BufferGeometry } | undefined;

/** Builds a loose carrot (shape and size like the table carrot's), on geometry every loose carrot shares. */
export function looseCarrot(look: CarrotLook): LooseCarrot {
  if (!shared) {
    const root = new THREE.ConeGeometry(0.075, 0.55, 12, 3);
    root.translate(0, 0.22, 0);
    const leaves = tuft(4, 0.025, 0.22, 0.35, true);
    leaves.translate(0, -0.05, 0);
    shared = { root, leaves };
  }
  const group = new THREE.Group();
  const body = new THREE.Group();
  group.add(body);
  for (const [geo, mat] of [
    [shared.root, look.carrot],
    [shared.leaves, look.leaf],
  ] as const) {
    const m = new THREE.Mesh(geo, mat);
    m.castShadow = true;
    m.receiveShadow = true;
    // It's bent onto the ring by its material, so its unbent bounds mean nothing to culling.
    m.frustumCulled = false;
    body.add(m);
  }
  return { kind: 'carrot', name: 'carrot', group, body, bites: 0, rest: 0.075 };
}

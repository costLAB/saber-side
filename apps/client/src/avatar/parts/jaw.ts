import * as THREE from 'three';
import type { PartKit } from './kit';

// Mouths. Every robot can open one to eat (shared sim/eating.ts): a head's jaw swings down on a hinge, and a robot
// with no head has a hatch on its body that flips open instead.
//
// A head's jaw is cut out of its own sphere, along the sphere's segment lines: the faces in the jaw's window move to
// a second mesh, keeping their vertices, normals, and UVs exactly as they were. So a shut jaw draws the head just as
// it was before it had one, with the skin's texture and seams lining up across the cut.

/** A robot's mouth: a hinge that swings `open` radians (about its x axis) when the mouth is wide open. */
export interface Jaw {
  hinge: THREE.Group;
  open: number;
  /** How open it is now, 0 (shut) to 1 (wide open). */
  amount: number;
}

/** Opens a mouth this far (0 shut to 1 wide open). */
export function setJaw(jaw: Jaw, amount: number) {
  jaw.amount = amount;
  jaw.hinge.rotation.x = amount * jaw.open;
}

/** Which of a sphere's segments the jaw takes: rows down from the top (the seam first), columns round from -x. */
export interface JawCut {
  rows: readonly [number, number];
  cols: readonly [number, number];
}

/** A SphereGeometry's own index of faces, split by the segment cell each face lies in. */
function splitFaces(geo: THREE.SphereGeometry, take: (row: number, col: number) => boolean) {
  const across = geo.parameters.widthSegments + 1;
  const index = geo.getIndex() as THREE.BufferAttribute;
  const kept: number[] = [];
  const taken: number[] = [];
  for (let i = 0; i < index.count; i += 3) {
    const tri = [index.getX(i), index.getX(i + 1), index.getX(i + 2)];
    const row = Math.min(...tri.map((v) => Math.floor(v / across)));
    const col = Math.min(...tri.map((v) => v % across));
    (take(row, col) ? taken : kept).push(...tri);
  }
  return { kept, taken };
}

/** A copy of `geo` drawing only these faces. */
function withFaces(geo: THREE.BufferGeometry, faces: number[]) {
  const g = new THREE.BufferGeometry();
  for (const name of ['position', 'normal', 'uv'] as const) g.setAttribute(name, geo.getAttribute(name));
  g.setIndex(faces);
  return g;
}

/**
 * Cuts a jaw out of a head's sphere (`skull`, a full SphereGeometry, already placed in its parent). The jaw hangs from
 * a hinge through the window's two top back corners, so it swings down and a little forward, and a dark mouth sits
 * behind it. The sphere's scale stays on the meshes, never on the hinge, so the swing doesn't shear.
 */
export function cutJaw(kit: PartKit, skull: THREE.Mesh, cut: JawCut, open: number): Jaw {
  const { materials: M, mesh } = kit;
  const geo = skull.geometry as THREE.SphereGeometry;
  const { radius: R, widthSegments: W, heightSegments: H } = geo.parameters;
  const [r0, r1] = cut.rows;
  const [c0, c1] = cut.cols;
  const { kept, taken } = splitFaces(geo, (row, col) => row >= r0 && row < r1 && col >= c0 && col < c1);
  skull.geometry = withFaces(geo, kept);
  geo.dispose();
  const parent = skull.parent as THREE.Object3D;

  // The hinge runs across through the window's top back corners (in the parent's frame).
  const theta = (r0 / H) * Math.PI;
  const phi = (c0 / W) * Math.PI * 2;
  const s = skull.scale;
  const hinge = new THREE.Group();
  hinge.position.set(
    skull.position.x,
    skull.position.y + s.y * R * Math.cos(theta),
    skull.position.z + s.z * R * Math.sin(phi) * Math.sin(theta),
  );
  parent.add(hinge);
  const jaw = mesh(withFaces(skull.geometry, taken), skull.material as THREE.Material, skull.castShadow);
  jaw.scale.copy(s);
  jaw.position.copy(skull.position).sub(hinge.position);
  hinge.add(jaw);

  // The inside of the mouth: a dark shell just inside the skin, behind the window (hidden while the jaw is shut).
  const margin = 2;
  const thetaLength = Math.min(Math.PI - theta, ((r1 - r0 + margin) / H) * Math.PI);
  const mouthGeo = new THREE.SphereGeometry(
    R * 0.94,
    24,
    8,
    ((c0 - margin) / W) * Math.PI * 2,
    ((c1 - c0 + margin * 2) / W) * Math.PI * 2,
    theta - (0.5 / H) * Math.PI,
    thetaLength,
  );
  const mouth = mesh(mouthGeo, M.dark, false);
  mouth.scale.copy(s);
  mouth.position.copy(skull.position);
  parent.add(mouth);

  return { hinge, open, amount: 0 };
}

/**
 * A hatch on the front of a body, for a robot with no head to eat through. `mount` is placed on the body facing out
 * along its +z; the lid hinges along its bottom edge and flips out and down.
 */
export function bodyHatch(kit: PartKit, mount: THREE.Object3D, w = 0.38, h = 0.24): Jaw {
  const { materials: M, mesh } = kit;
  const frame = mesh(new THREE.BoxGeometry(w + 0.07, h + 0.07, 0.04), M.metal);
  mount.add(frame);
  const hole = mesh(new THREE.BoxGeometry(w, h, 0.05), M.dark, false);
  hole.position.z = 0.005;
  mount.add(hole);
  const hinge = new THREE.Group();
  hinge.position.set(0, -h / 2, 0.035);
  mount.add(hinge);
  const lid = mesh(new THREE.BoxGeometry(w, h, 0.03), M.band);
  lid.position.y = h / 2;
  hinge.add(lid);
  const handle = mesh(new THREE.BoxGeometry(w * 0.35, 0.03, 0.04), M.metal);
  handle.position.set(0, h * 0.8, 0.025);
  hinge.add(handle);
  return { hinge, open: 1.4, amount: 0 };
}

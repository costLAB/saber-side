import { CAT_TAIL } from '@saber-side/shared';
import * as THREE from 'three';
import { CAT, type CatLook, INK } from './cat-look';

// Snatch's tail: a thick ringed tube along a spline, from the middle of the cat's back, along under it, and curling up
// behind its right paw. It's in the cat body's frame (model units).
//
// The tube is built once, along the rest pose, and skinned to one bone per point of the spline. The ragdoll
// (shared/sim/tail-chain.ts, driven from app/tails.ts) moves the bones with `pose`, so the tail bends without its
// geometry being rebuilt every frame. Its outlines are skinned to the same bones.

/** The tail's rest pose: its spline's points, root first (inside the body) to the tip. */
export const TAIL_REST = CAT_TAIL.rest;

export const TAIL_RADIUS = CAT_TAIL.radius;

/** Its rings, from the root: where each ends along the spline (0 to 1), its color, and whether it's fur (takes paint). */
const RINGS = [
  { to: 0.65, color: CAT.tailFur, fur: true },
  { to: 0.7, color: CAT.ring, fur: false },
  { to: 0.87, color: CAT.orange, fur: false },
  { to: 1, color: CAT.tailFur, fur: true },
] as const;

const RADIAL = 16;

/** One ring's stretch of the tail's spline, from t0 to t1. */
class Span extends THREE.Curve<THREE.Vector3> {
  readonly whole: THREE.Curve<THREE.Vector3>;
  readonly t0: number;
  readonly t1: number;
  constructor(whole: THREE.Curve<THREE.Vector3>, t0: number, t1: number) {
    super();
    this.whole = whole;
    this.t0 = t0;
    this.t1 = t1;
  }
  override getPoint(u: number, out = new THREE.Vector3()): THREE.Vector3 {
    return out.copy(this.whole.getPoint(this.t0 + u * (this.t1 - this.t0)));
  }
}

export interface CatTail {
  group: THREE.Group;
  /** One bone per point of the rest pose, root first, in `group`'s frame. */
  bones: THREE.Bone[];
  /** Bends the tail through these points (the same count as TAIL_REST, root first, in `group`'s frame). */
  pose(points: readonly THREE.Vector3[]): void;
  /** Back to the rest pose. */
  rest(): void;
}

const rest = TAIL_REST.map(([x, y, z]) => new THREE.Vector3(x, y, z));

/** The way the spline runs at each point of the rest pose. */
const restTangents = rest.map((_, i) => tangentAt(rest, i, new THREE.Vector3()));

function tangentAt(points: readonly THREE.Vector3[], i: number, out: THREE.Vector3): THREE.Vector3 {
  const a = points[Math.max(0, i - 1)] as THREE.Vector3;
  const b = points[Math.min(points.length - 1, i + 1)] as THREE.Vector3;
  return out.subVectors(b, a).normalize();
}

/** A tube for one ring, skinned to the bones either side of each of its rings of vertices. */
function ringTube(curve: THREE.Curve<THREE.Vector3>, t0: number, t1: number): THREE.TubeGeometry {
  const span = new Span(curve, t0, t1);
  const tubular = Math.max(6, Math.round(48 * (t1 - t0)));
  const geo = new THREE.TubeGeometry(span, tubular, TAIL_RADIUS, RADIAL, false);
  const count = geo.attributes.position?.count ?? 0;
  const index = new Uint16Array(count * 4);
  const weight = new Float32Array(count * 4);
  const last = rest.length - 1;
  for (let v = 0; v < count; v++) {
    // TubeGeometry lays its vertices out ring by ring, at even arc lengths along the span (getPointAt).
    const ring = Math.floor(v / (RADIAL + 1));
    const t = t0 + span.getUtoTmapping(ring / tubular, 0) * (t1 - t0);
    const s = t * last;
    const j = Math.min(Math.floor(s), last - 1);
    const f = s - j;
    index.set([j, j + 1, 0, 0], v * 4);
    weight.set([1 - f, f, 0, 0], v * 4);
  }
  geo.setAttribute('skinIndex', new THREE.Uint16BufferAttribute(index, 4));
  geo.setAttribute('skinWeight', new THREE.Float32BufferAttribute(weight, 4));
  return geo;
}

const _t = new THREE.Vector3();

export function buildCatTail(look: CatLook): CatTail {
  const group = new THREE.Group();
  const bones = rest.map((p) => {
    const b = new THREE.Bone();
    b.position.copy(p);
    group.add(b);
    return b;
  });
  const curve = new THREE.CatmullRomCurve3(rest, false, 'centripetal');
  const meshes: THREE.SkinnedMesh[] = [];
  let tipMat: THREE.Material | undefined;
  let from = 0;
  for (const r of RINGS) {
    const mat = r.fur ? look.fur(r.color) : look.toon(r.color);
    tipMat = mat;
    const mesh = new THREE.SkinnedMesh(ringTube(curve, from, r.to), mat);
    from = r.to;
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    look.ink(mesh, INK.thick);
    group.add(mesh);
    meshes.push(mesh, ...(look.outlines(mesh) as THREE.SkinnedMesh[]));
  }
  // The round tip, in the last ring's fur, rides on the last bone.
  const tip = look.ink(look.kit.mesh(new THREE.SphereGeometry(TAIL_RADIUS, 24, 16), tipMat as THREE.Material));
  (bones[bones.length - 1] as THREE.Bone).add(tip);

  // Bind every tube and its outlines to the bones as they stand now, at rest.
  group.updateMatrixWorld(true);
  const skeleton = new THREE.Skeleton(bones);
  for (const m of meshes) {
    m.bind(skeleton);
    // Skinned and bent onto the ring in the shader: their bounds don't follow, so they're always drawn.
    m.frustumCulled = false;
  }

  const tail: CatTail = {
    group,
    bones,
    pose(points) {
      bones.forEach((b, i) => {
        b.position.copy(points[i] as THREE.Vector3);
        b.quaternion.setFromUnitVectors(restTangents[i] as THREE.Vector3, tangentAt(points, i, _t));
      });
    },
    rest() {
      bones.forEach((b, i) => {
        b.position.copy(rest[i] as THREE.Vector3);
        b.quaternion.identity();
      });
    },
  };
  return tail;
}

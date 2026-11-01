import { ORIGINAL_PAINT } from '@saber-side/shared';
import * as THREE from 'three';
import { patchShader } from '../../render/shader-patch';

// What every robot part is built with: the shared materials and helpers (the legacy game's, so everything casts and
// glows the same way), plus the paint for this robot.
//
// Paint is a coat over the part's original skin (docs/initiatives/carrot-economy.md): each painted part draws
// `mix(skin, skin × paint, cure)`, so the skin's seams, rivets, grime, and bump read through it. One `cure` uniform per
// robot sets how opaque every coat on it is, from 0 (bare skin) to 1 (fully cured, exactly the old flat tint). A coat
// still curing looks a little glossy, like wet paint.

export const TAU = Math.PI * 2;

/** The materials robots are built from. Parts with paint get coat copies; unpainted parts share these. */
export interface RobotMaterials {
  shell: THREE.Material;
  head: THREE.Material;
  limb: THREE.Material;
  band: THREE.Material;
  drive: THREE.Material;
  metal: THREE.Material;
  dark: THREE.Material;
  tip: THREE.Material;
  lens: THREE.Material;
  core: THREE.Material;
  led: THREE.Material;
}

/** The helpers a robot is built with. */
export interface RobotKit {
  materials: RobotMaterials;
  mesh(geo: THREE.BufferGeometry, mat: THREE.Material, cast?: boolean): THREE.Mesh;
  glow(color: number, size: number, opacity?: number): THREE.Sprite;
  toTex(c: HTMLCanvasElement, srgb: boolean): THREE.Texture;
}

/** How opaque a robot's paint coats are drawn, from 0 to 1: one uniform shared by every coat on the robot. */
export type CoatCure = { value: number };

/** A kit for building one robot: the shared kit, plus `tint` for its painted parts. */
export interface PartKit extends RobotKit {
  /**
   * The material for a part in `paint`: the shared one for the original skin, otherwise a coat copy. `boost`
   * brightens the coat for dark skins, which would otherwise swallow the color.
   */
  tint(base: THREE.Material, paint: string, boost?: number): THREE.Material;
  /** The robot's coat cure (starts fully cured). */
  cure: CoatCure;
}

/** A coat that's just been painted is this much glossier than the skin (its roughness, times this). */
const WET = 0.6;

export function partKit(kit: RobotKit): PartKit {
  const copies = new Map<string, THREE.Material>();
  const cure: CoatCure = { value: 1 };
  return {
    ...kit,
    cure,
    tint(base, paint, boost = 1) {
      if (paint === ORIGINAL_PAINT) return base;
      const key = `${base.uuid}|${paint}|${boost}`;
      let m = copies.get(key);
      if (!m) {
        // A copy doesn't carry its original's shader patches (the ring bend): whoever bends the robot bends it too.
        m = base.clone();
        coat(m, new THREE.Color(paint).multiplyScalar(boost), cure);
        copies.set(key, m);
      }
      return m;
    },
  };
}

/** Makes a material a paint coat: its skin (color and map) times `paint`, as opaque as `cure` says. */
function coat(m: THREE.Material, paint: THREE.Color, cure: CoatCure) {
  const uCoat = { value: paint };
  patchShader(m, 'coat', (sh) => {
    sh.uniforms.uCure = cure;
    sh.uniforms.uCoat = uCoat;
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', '#include <common>\nuniform float uCure;\nuniform vec3 uCoat;')
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= mix( vec3( 1.0 ), uCoat, uCure );',
      )
      .replace(
        '#include <roughnessmap_fragment>',
        `#include <roughnessmap_fragment>\n  roughnessFactor *= mix( ${WET.toFixed(2)}, 1.0, uCure );`,
      );
  });
}

/** Places obj on a sphere of radius r: lat up from the equator, lon from +z toward +x; obj's +z faces outward. */
export function onSphere<T extends THREE.Object3D>(obj: T, r: number, lat: number, lon: number): T {
  obj.position.set(r * Math.cos(lat) * Math.sin(lon), r * Math.sin(lat), r * Math.cos(lat) * Math.cos(lon));
  obj.rotation.set(-lat, lon, 0, 'YXZ');
  return obj;
}

/** Places obj on an upright cylinder of radius r at height y, lon from +z toward +x; obj's +z faces outward. */
export function onDrum<T extends THREE.Object3D>(obj: T, r: number, y: number, lon: number): T {
  obj.position.set(r * Math.sin(lon), y, r * Math.cos(lon));
  obj.rotation.set(0, lon, 0);
  return obj;
}

export const Cyl = (a: number, b: number, h: number, s = 20) => new THREE.CylinderGeometry(a, b, h, s);
export const Sph = (r: number, w = 20, h = 14) => new THREE.SphereGeometry(r, w, h);
export const zCyl = (a: number, b: number, h: number, s = 24) => {
  const g = Cyl(a, b, h, s);
  g.rotateX(Math.PI / 2);
  return g;
};
/** A ring lying flat (around y). */
export const flatRing = (r: number, tube: number, seg = 48) => {
  const g = new THREE.TorusGeometry(r, tube, 8, seg);
  g.rotateX(Math.PI / 2);
  return g;
};

/** Where a body lets the other parts attach, in the core's frame: the origin is the wheel's center. */
export interface BodyMounts {
  /** Height of the neck. */
  neckY: number;
  /** The right shoulder (+x); the left one mirrors it. */
  shoulder: readonly [number, number, number];
  /** Where a robot with no arms carries what it holds. */
  hold: readonly [number, number, number];
  /** Where a robot with no head has the hatch it eats through: a spot facing out on the front, and its size. */
  mouth: { position: readonly [number, number, number]; lat: number; lon: number; w?: number; h?: number };
}

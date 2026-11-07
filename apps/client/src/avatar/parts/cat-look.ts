import { ORIGINAL_PAINT } from '@saber-side/shared';
import * as THREE from 'three';
import { patchShader } from '../../render/shader-patch';
import type { PartKit } from './kit';

// How Snatch, the sketchbook cat, is drawn (docs/initiatives/sketchbook-characters.md): cel-shaded on a stepped ramp,
// with thick near-black outlines drawn as an inverted hull, unlike every other part. Paint covers the gray fur only:
// the cream, pink, orange, nose, and eyes keep their colors.
//
// The cat's numbers are in model units, from the concept model the owner reviewed; the game draws it CAT_SCALE that
// size, sitting on the drive ball like every other body.

export const CAT_SCALE = 0.9;

/** The owner's close-up's colors, as sRGB hex. */
export const CAT = {
  fur: '#7d6c74',
  bodyFur: '#6f5b64',
  tailFur: '#76656d',
  ring: '#5d4d56',
  cream: '#fee7cd',
  armCream: '#ffe6c8',
  pink: '#f9ab90',
  orange: '#fb9a25',
  nose: '#fb8a62',
  noseShine: '#ffd2b8',
  ink: '#120c0e',
} as const;

/**
 * The station's lights are bright for flat cartoon colors: under them, a color this much darker shows on screen about
 * as its hex reads. Every cat color takes it, paint included, so a painted cat is the color picked.
 */
const LIGHT = 0.42;

/** How thick the outlines are, in the units of the mesh they go round. */
export const INK = { thick: 0.038, thin: 0.018 } as const;

/** An sRGB hex as the linear color three draws with (color management is off: render/legacy-look.ts). */
export const linear = (hex: string) => new THREE.Color(hex).convertSRGBToLinear();

let ramp: THREE.DataTexture | undefined;
/** Four flat steps of light, so each surface reads as light, mid, and shadow, like the drawing. */
function toonRamp(): THREE.DataTexture {
  if (!ramp) {
    const steps = [110, 168, 218, 255];
    const data = new Uint8Array(steps.length * 4);
    steps.forEach((v, i) => {
      data.set([v, v, v, 255], i * 4);
    });
    ramp = new THREE.DataTexture(data, steps.length, 1, THREE.RGBAFormat);
    ramp.minFilter = THREE.NearestFilter;
    ramp.magFilter = THREE.NearestFilter;
    ramp.needsUpdate = true;
  }
  return ramp;
}

/**
 * A skin projected onto a part from the front, with its own skins for the back and the sides, blended across by depth
 * and by which way the surface faces. Each is a detail layer over the fur: where it's clear, the fur shows.
 */
export interface CatSkin {
  front: THREE.Texture;
  back: THREE.Texture;
  side: THREE.Texture;
  /** x and y to the front skin's u and v: scale x, scale y, offset u, offset v (the back mirrors u). */
  uv: readonly [number, number, number, number];
  /** z and y to the side skin's u and v, the same way. */
  sideUv: readonly [number, number, number, number];
  /** Where the back fades into the front, along z. */
  z: readonly [number, number];
  /** Where the sides take over, by the surface normal's |x|. */
  sides: readonly [number, number];
}

export interface CatLook {
  kit: PartKit;
  /** A cel-shaded material in one color that never takes paint. */
  toon(hex: string): THREE.MeshToonMaterial;
  /** A cel-shaded material with a picture on it (an eye) that never takes paint. */
  painted(map: THREE.Texture): THREE.MeshToonMaterial;
  /** Cel-shaded fur: `hex`, or the robot's paint over it as its coat cures. */
  fur(hex: string): THREE.Material;
  /** Cel-shaded fur with a skin of details over it (a face, a belly), the fur taking paint as `fur` does. */
  skin(hex: string, skin: CatSkin): THREE.Material;
  /** Gives `mesh` an outline `width` thick (in its own units), drawn round `geometry` (by default, its own). */
  ink<T extends THREE.Mesh>(mesh: T, width?: number, geometry?: THREE.BufferGeometry): T;
  /** The outline meshes drawn round `mesh`, to swap their geometry when the mesh's changes. */
  outlines(mesh: THREE.Mesh): THREE.Mesh[];
}

/** One robot's look: every cat part builds its own, with that part's paint. */
export function catLook(kit: PartKit, paint: string): CatLook {
  const outlineMats = new Map<number, THREE.Material>();
  const hulls = new WeakMap<THREE.Mesh, THREE.Mesh[]>();
  const toon = (hex: string) =>
    new THREE.MeshToonMaterial({ color: linear(hex).multiplyScalar(LIGHT), gradientMap: toonRamp() });
  return {
    kit,
    toon,
    painted: (map) => new THREE.MeshToonMaterial({ map, color: lit(), gradientMap: toonRamp() }),
    fur: (hex) => furMaterial(kit, hex, paint),
    skin: (hex, skin) => skinMaterial(kit, hex, paint, skin),
    ink(mesh, width = INK.thick, geometry = mesh.geometry) {
      let m = outlineMats.get(width);
      if (!m) {
        m = outlineMaterial(width);
        outlineMats.set(width, m);
      }
      const hull = new THREE.Mesh(geometry, m);
      hull.castShadow = false;
      hull.receiveShadow = false;
      mesh.add(hull);
      hulls.set(mesh, [...(hulls.get(mesh) ?? []), hull]);
      return mesh;
    },
    outlines: (mesh) => hulls.get(mesh) ?? [],
  };
}

/** The outline: the mesh again, pushed out along its normals, back faces only, in near-black. */
function outlineMaterial(width: number): THREE.Material {
  const m = new THREE.MeshBasicMaterial({ color: linear(CAT.ink), side: THREE.BackSide });
  const w = width.toFixed(4);
  patchShader(m, `cat-outline-${w}`, (sh) => {
    sh.vertexShader = sh.vertexShader.replace(
      '#include <begin_vertex>',
      `#include <begin_vertex>\n  transformed += normalize( normal ) * ${w};`,
    );
  });
  return m;
}

/** White, dimmed for the station's lights. */
const lit = () => new THREE.Color(LIGHT, LIGHT, LIGHT);

/** The fur's color and paint: the gray, to the paint as its coat cures. One cure for every coat on the robot. */
function coatUniforms(kit: PartKit, hex: string, paint: string) {
  return {
    uFur: { value: linear(hex) },
    uCoat: { value: linear(paint) },
    uPainted: { value: paint === ORIGINAL_PAINT ? 0 : 1 },
    uCure: kit.cure,
  };
}
const COAT_GLSL = 'uniform vec3 uFur;\nuniform vec3 uCoat;\nuniform float uPainted;\nuniform float uCure;';

/** Plain fur, painted over as its coat cures (a flat coat of the color picked once it's cured). */
function furMaterial(kit: PartKit, hex: string, paint: string): THREE.Material {
  const m = new THREE.MeshToonMaterial({ color: lit(), gradientMap: toonRamp() });
  if (paint !== ORIGINAL_PAINT) m.userData.coat = paint;
  const uniforms = coatUniforms(kit, hex, paint);
  patchShader(m, 'cat-fur', (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.fragmentShader = sh.fragmentShader
      .replace('#include <common>', `#include <common>\n${COAT_GLSL}`)
      .replace(
        '#include <map_fragment>',
        '#include <map_fragment>\n  diffuseColor.rgb *= mix( uFur, uCoat, uCure * uPainted );',
      );
  });
  return m;
}

function skinMaterial(kit: PartKit, hex: string, paint: string, skin: CatSkin): THREE.Material {
  const m = new THREE.MeshToonMaterial({ color: lit(), map: skin.front, gradientMap: toonRamp() });
  if (paint !== ORIGINAL_PAINT) m.userData.coat = paint;
  const uniforms = {
    uBack: { value: skin.back },
    uSide: { value: skin.side },
    uUv: { value: new THREE.Vector4(...skin.uv) },
    uSideUv: { value: new THREE.Vector4(...skin.sideUv) },
    uZ: { value: new THREE.Vector2(...skin.z) },
    uSides: { value: new THREE.Vector2(...skin.sides) },
    ...coatUniforms(kit, hex, paint),
  };
  patchShader(m, 'cat-skin', (sh) => {
    Object.assign(sh.uniforms, uniforms);
    sh.vertexShader = sh.vertexShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vCatPos;\nvarying vec3 vCatNormal;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\n  vCatPos = position;\n  vCatNormal = normal;');
    sh.fragmentShader = sh.fragmentShader
      .replace(
        '#include <common>',
        `#include <common>
varying vec3 vCatPos;
varying vec3 vCatNormal;
uniform sampler2D uBack;
uniform sampler2D uSide;
uniform vec4 uUv;
uniform vec4 uSideUv;
uniform vec2 uZ;
uniform vec2 uSides;
${COAT_GLSL}`,
      )
      .replace(
        '#include <map_fragment>',
        `vec2 catUv = vec2( vCatPos.x * uUv.x + uUv.z, vCatPos.y * uUv.y + uUv.w );
  vec4 catDetail = mix(
    texture2D( uBack, vec2( -vCatPos.x * uUv.x + uUv.z, catUv.y ) ),
    texture2D( map, catUv ),
    smoothstep( uZ.x, uZ.y, vCatPos.z ) );
  vec4 catSide = texture2D( uSide, vec2( vCatPos.z * uSideUv.x + uSideUv.z, vCatPos.y * uSideUv.y + uSideUv.w ) );
  catDetail = mix( catDetail, catSide, smoothstep( uSides.x, uSides.y, abs( normalize( vCatNormal ).x ) ) );
  vec3 catFur = mix( uFur, uCoat, uCure * uPainted );
  diffuseColor.rgb *= mix( catFur, catDetail.rgb, catDetail.a );`,
      );
  });
  return m;
}

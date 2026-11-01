import type * as THREE from 'three';

// Shader patches that stack. A material has only one `onBeforeCompile`, so two features that each set their own (the
// ring bend, a robot's paint coat) would wipe each other out. Every patch goes through `patchShader` instead: each
// material keeps its list of patches, runs them all in the order they were added, and tells three a program cache key
// naming all of them, so materials with different patches never share a compiled program.

export type ShaderPatch = (shader: THREE.Shader, renderer: THREE.WebGLRenderer) => void;

/**
 * The patches on each material. Kept here, not in `userData`: a material's clone copies `userData` as JSON, which
 * would drop the functions (and a clone doesn't carry its original's patches anyway).
 */
const patches = new WeakMap<THREE.Material, Map<string, ShaderPatch>>();

/** Adds a patch to a material's shaders, under `key`. Adding the same key again changes nothing. */
export function patchShader(m: THREE.Material, key: string, patch: ShaderPatch) {
  let list = patches.get(m);
  if (list?.has(key)) return;
  if (!list) {
    list = new Map();
    patches.set(m, list);
  }
  list.set(key, patch);
  const all = list;
  m.onBeforeCompile = (shader, renderer) => {
    for (const p of all.values()) p(shader, renderer);
  };
  const cacheKey = [...all.keys()].join('+');
  m.customProgramCacheKey = () => cacheKey;
  m.needsUpdate = true;
}

/** Whether a material has a patch under `key`. */
export function hasPatch(m: THREE.Material, key: string): boolean {
  return patches.get(m)?.has(key) ?? false;
}

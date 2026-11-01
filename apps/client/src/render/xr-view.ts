import * as THREE from 'three';

// In VR the headset reports meters, but the station is built in the prototype's scene units, and the player's eyes have
// to sit at a robot's eyes. So the VR camera hangs from a rig that's scaled up (app/vr.ts), and everything three.js
// works out in view space comes out scaled down by the same factor. Positions and lighting directions don't mind, but
// three things measure distances in view space, and they're put back here:
//
// - sprites (glows, dust, sparks): their size is added in view space, so they'd draw too big
// - fog: it starts and ends at view-space depths, so it would sit too far away
// - point and spot lights: their reach is checked against view-space distances, so they'd reach too far
//
// The flat view isn't scaled, so none of this changes what it draws.

const SPRITE_SCALE = 'vec2 alignedPosition = ( position.xy - ( center - vec2( 0.5 ) ) ) * scale;';

/**
 * Makes attenuated sprites keep their world size under a scaled view. A flat camera's view isn't scaled, so flat
 * sprites draw the same. Call once, before anything compiles.
 */
export function keepSpriteSizeInScaledViews() {
  const lib = THREE.ShaderLib.sprite;
  if (lib.vertexShader.includes('xrViewScale')) return;
  if (!lib.vertexShader.includes(SPRITE_SCALE)) throw new Error('three.js sprite shader changed: update xr-view.ts');
  lib.vertexShader = lib.vertexShader.replace(
    SPRITE_SCALE,
    // three.js r128 doesn't upload viewMatrix for sprites, so the view's scale comes from modelViewMatrix over modelMatrix
    `#ifdef USE_SIZEATTENUATION
	if ( scale.x > 0.0 ) scale *= length( modelViewMatrix[ 0 ].xyz ) / scale.x; // xrViewScale
	#endif
	${SPRITE_SCALE}`,
  );
}

type Reaching = THREE.PointLight | THREE.SpotLight;

/** Collects a scene's lights that have a reach, so their reach can be scaled for each VR frame. */
function reachingLights(scene: THREE.Object3D): Reaching[] {
  const out: Reaching[] = [];
  scene.traverse((o) => {
    if (o instanceof THREE.PointLight || o instanceof THREE.SpotLight) out.push(o);
  });
  return out;
}

/**
 * Draws a scene through a camera whose view is scaled by `viewScale` (view-space units per scene unit), with fog and
 * light reach scaled to match, then puts them back.
 */
export function createScaledViewDraw(renderer: THREE.WebGLRenderer) {
  let lights: Reaching[] = [];
  let lightsOf: THREE.Object3D | null = null;
  let frames = 0;

  return function drawScaled(scene: THREE.Scene, camera: THREE.Camera, viewScale: number) {
    // a scene's lights are gathered when it first shows, and every couple of seconds after, to catch new ones
    if (scene !== lightsOf || ++frames % 120 === 0) {
      lights = reachingLights(scene);
      lightsOf = scene;
    }
    const fog = scene.fog as THREE.Fog | null;
    const near = fog?.near ?? 0;
    const far = fog?.far ?? 0;
    if (fog && 'near' in fog) {
      fog.near = near * viewScale;
      fog.far = far * viewScale;
    }
    const reach = lights.map((L) => L.distance);
    for (const L of lights) L.distance *= viewScale;
    try {
      renderer.render(scene, camera);
    } finally {
      if (fog && 'near' in fog) {
        fog.near = near;
        fog.far = far;
      }
      lights.forEach((L, i) => {
        L.distance = reach[i] as number;
      });
    }
  };
}

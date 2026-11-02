import { R_IN } from '@saber-side/shared';
import type * as THREE from 'three';

// Everything that lives on the floor is simulated on a flat strip (x across, z around the ring, y up) and bent onto the
// cylinder in the vertex shader. The CPU uses the same mapping (bendPoint in @saber-side/shared) for the camera and
// lights. Anything parked above y = 5000 is "real space" (lift tubes, hub, end caps): drawn unbent, 10000 lower.

/** How high real space is parked: anything above half of this is drawn as-is, this much lower (see BEND_GLSL). */
export const REAL_OFF = 10000;

/** The GLSL twin of `bendPoint` / `bendUp`: `bendPos` for positions, `bendDir` for normals. */
export const BEND_GLSL = `
#define BEND_R ${R_IN.toFixed(4)}
vec4 bendPos( vec4 w ) { if ( w.y > 5000.0 ) return vec4( w.x, w.y - 10000.0, w.z, 1.0 ); float th = -w.z / BEND_R; float r = BEND_R - w.y; return vec4( w.x, -r * cos( th ), -r * sin( th ), 1.0 ); }
vec3 bendDir( vec3 v, float th ) { float c = cos( th ), s = sin( th ); return vec3( v.x, c * v.y - s * v.z, s * v.y + c * v.z ); }
`;

/**
 * Patches a material's vertex shader so whatever uses it is bent onto the ring (or drawn as-is in real space).
 * Works for meshes, instanced meshes, and sprites. Safe to call twice.
 */
export function bendMaterial(m: THREE.Material) {
  if (m.userData.bent) return;
  m.userData.bent = true;
  m.onBeforeCompile = (sh) => {
    sh.vertexShader = sh.vertexShader.replace('#include <common>', `#include <common>\n${BEND_GLSL}`);
    if ((m as THREE.SpriteMaterial).isSpriteMaterial) {
      // three never uploads `viewMatrix` for sprite materials (it stays all zeros), so this can't do what the mesh
      // patch does. Instead it carries the bent centre back into the sprite's own space (the inverse of modelMatrix,
      // via the adjugate, which also works in WebGL1) and lets modelViewMatrix (view * model) take it to view space.
      // That is the per-object, per-eye view matrix three already sets, so it is right in VR too.
      sh.vertexShader = sh.vertexShader.replace(
        'vec4 mvPosition = modelViewMatrix * vec4( 0.0, 0.0, 0.0, 1.0 );',
        `
        vec4 mvPosition;
        {
          vec3 o = modelMatrix[ 3 ].xyz;
          vec3 d = bendPos( vec4( o, 1.0 ) ).xyz - o;
          vec3 a = modelMatrix[ 0 ].xyz, b = modelMatrix[ 1 ].xyz, c = modelMatrix[ 2 ].xyz;
          vec3 ia = cross( b, c ), ib = cross( c, a ), ic = cross( a, b );
          mvPosition = modelViewMatrix * vec4( vec3( dot( ia, d ), dot( ib, d ), dot( ic, d ) ) / dot( a, ia ), 1.0 );
        }`,
      );
      return;
    }
    sh.vertexShader = sh.vertexShader.replace(
      '#include <project_vertex>',
      `
      vec4 bl = vec4( transformed, 1.0 );
      #ifdef USE_INSTANCING
        bl = instanceMatrix * bl;
      #endif
      vec4 mvPosition = viewMatrix * bendPos( modelMatrix * bl );
      gl_Position = projectionMatrix * mvPosition;`,
    );
    sh.vertexShader = sh.vertexShader.replace(
      'transformedNormal = normalMatrix * transformedNormal;',
      `
      {
        vec4 bp0 = vec4( position, 1.0 );
        #ifdef USE_INSTANCING
          bp0 = instanceMatrix * bp0;
        #endif
        bp0 = modelMatrix * bp0;
        vec3 wn0 = normalize( mat3( modelMatrix ) * transformedNormal );
        transformedNormal = mat3( viewMatrix ) * ( bp0.y > 5000.0 ? wn0 : bendDir( wn0, -bp0.z / BEND_R ) );
      }`,
    );
  };
  m.customProgramCacheKey = () => 'bend';
  m.needsUpdate = true;
}

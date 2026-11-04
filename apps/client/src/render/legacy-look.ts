import * as THREE from 'three';

// The game's colors and lights were all tuned on three.js r128. Two things changed since, and this keeps the look:
//
// - Color management (r152): three now reads hex colors as sRGB and converts them to linear. r128 used them as they
//   were, so it's turned off here, before any color is made (main.ts imports this first). Textures still say they're
//   sRGB, and the output is still sRGB, as before.
// - Light units (r155, and r165 removed the old ones): lights are physically based now, so an old intensity needs
//   multiplying by π to light things about as brightly. Every light goes through `lux`. (Their falloff with distance
//   changed shape a little too; that can't be put back.)
THREE.ColorManagement.enabled = false;

/** An r128 light intensity, in today's units. */
export const lux = (r128: number): number => r128 * Math.PI;

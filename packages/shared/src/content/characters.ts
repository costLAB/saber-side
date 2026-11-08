// Characters: whole robots drawn in a sketchbook (docs/initiatives/sketchbook-characters.md). Each one is a head, a
// body, and arms from the ordinary parts lists, so a kid can put a whole character on in one go, or mix its parts
// with any others.

import type { PartId, RobotBuild } from './robot-parts.ts';
import { ORIGINAL_PAINT } from './robot-parts.ts';

export interface Character {
  id: string;
  /** The robot's name on the sheet. */
  name: string;
  /** What the drawing was of. */
  word: string;
  parts: { body: PartId<'body'>; head: PartId<'head'>; arms: PartId<'arms'> };
}

export const CHARACTERS: readonly Character[] = [
  { id: 'snatch', name: 'Snatch', word: 'Cat', parts: { body: 'cat', head: 'cat', arms: 'cat' } },
  { id: 'astro', name: 'Astro', word: 'Astronaut', parts: { body: 'astro', head: 'astro', arms: 'astro' } },
];

/** A build wearing a character: its head, body, and arms, each in its original skin. The wheel stays as it was. */
export function wearCharacter(build: RobotBuild, character: Character): RobotBuild {
  return {
    mobility: build.mobility,
    body: { part: character.parts.body, paint: ORIGINAL_PAINT },
    head: { part: character.parts.head, paint: ORIGINAL_PAINT },
    arms: { part: character.parts.arms, paint: ORIGINAL_PAINT },
  };
}

/** The character a build is wearing all of, if any. */
export function characterOf(build: RobotBuild): Character | undefined {
  return CHARACTERS.find(
    (c) => build.body?.part === c.parts.body && build.head?.part === c.parts.head && build.arms?.part === c.parts.arms,
  );
}

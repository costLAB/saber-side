import { insideRoadmapHut } from '@saber-side/shared';
import { createRoadmapSheet } from '../ui/roadmap-sheet';
import { onDoorway } from './doorways';

/**
 * The Roadmap hut, in the park behind the Robot Registry: driving in through its door opens the Roadmap (what's been
 * built, and what's next, in order). It needs no station, so it works offline and before coming aboard.
 */
export function openRoadmapFromHut() {
  const sheet = createRoadmapSheet(() => {});
  onDoorway(insideRoadmapHut, { open: () => sheet.show(), isOpen: () => sheet.open });
  if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __roadmap: sheet });
}

// Bundled fonts (previously loaded from Google Fonts) so the game works offline and renders the same everywhere.
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

// before anything makes a color: keeps r128's colors and lights (render/legacy-look.ts)
import './render/legacy-look';
import './legacy/game.js';
import { comeAboard } from './app/aboard';
import { openRoadmapFromHut } from './app/roadmap-hut';
import { createTails } from './app/tails';
import { legacy } from './legacy/game.js';
import { stationServerUrl } from './net/server-url';

// The Roadmap hut in the park works with or without a station.
openRoadmapFromHut();

// Online: come aboard the shared station when this build has a server. Single-player play doesn't wait on it.
const server = stationServerUrl();
const statusEl = document.getElementById('station');
// Every cat's tail swings as a ragdoll, online or not, and online friends can grab it (app/tails.ts).
const tails = createTails({ bot: legacy.world.bot, drivingOnFloor: () => legacy.drivingOnFloor() });
legacy.tail = tails;
if (server && statusEl) comeAboard(server, statusEl, tails);
// After presence (which comeAboard adds), so friends' robots are posed before their tails swing.
legacy.frameHooks.push((dt) => tails.frame(dt));
if (new URLSearchParams(location.search).has('debug')) Object.assign(window, { __tails: tails });

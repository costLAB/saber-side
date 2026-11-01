// Bundled fonts (previously loaded from Google Fonts) so the game works offline and renders the same everywhere.
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';

import './legacy/game.js';
import { comeAboard } from './app/aboard';
import { stationServerUrl } from './net/server-url';

// Online: come aboard the shared station when this build has a server. Single-player play doesn't wait on it.
const server = stationServerUrl();
const statusEl = document.getElementById('station');
if (server && statusEl) comeAboard(server, statusEl);

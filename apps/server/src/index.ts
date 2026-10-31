// The station server's entry point: `pnpm dev` (with --watch) locally, `node src/index.ts` on Render.
// Node runs this TypeScript directly (type stripping), so there's no build step.
import { startStation } from './app.ts';
import { readConfig } from './config.ts';

const config = readConfig();
const station = await startStation(config);
const { station: name, since } = station.health();
console.log(`${name} is open on port ${station.port} (database ${config.databasePath}, since ${since})`);

import { defineRoom, defineServer, matchMaker } from '@colyseus/core';
import { WebSocketTransport } from '@colyseus/ws-transport';
import { PROTOCOL_VERSION, STATION_CAPACITY, STATION_ROOM, type StationHealth } from '@saber-side/shared';
import type { ServerConfig } from './config.ts';
import { loadStation, openDatabase } from './db.ts';
import { originChecker } from './origins.ts';
import { defineStationRoom } from './rooms/station-room.ts';

export interface RunningStation {
  /** The port actually bound (useful when the config asked for 0, "any free port"). */
  port: number;
  health(): StationHealth;
}

/**
 * Boots the whole server in one process: the database, the station room, the health check, and the WebSocket
 * listener. Colyseus handles SIGTERM itself (Render sends one before each deploy): rooms get `onBeforeShutdown`,
 * then the process exits once they've closed.
 */
export async function startStation(config: ServerConfig): Promise<RunningStation> {
  const db = openDatabase(config.databasePath);
  const record = loadStation(db);
  let aboard = 0;
  const health = (): StationHealth => ({
    ok: true,
    protocol: PROTOCOL_VERSION,
    station: record.name,
    since: record.createdAt,
    aboard,
    capacity: STATION_CAPACITY,
  });

  // Only pages from the allowed origins may join. Browsers enforce this for matchmaking (an HTTP request) through
  // CORS, and the WebSocket upgrade checks the Origin header itself. Colyseus's defaults answer every origin with `*`,
  // so that's dropped and only allowed origins get the header back.
  const allowed = originChecker(config.allowedOrigins);
  delete (matchMaker.controller.DEFAULT_CORS_HEADERS as Record<string, string>)['Access-Control-Allow-Origin'];
  matchMaker.controller.getCorsHeaders = (headers: Headers): Record<string, string> => {
    const origin = headers.get('origin');
    return origin && allowed(origin) ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {};
  };

  const server = defineServer({
    greet: false,
    transport: new WebSocketTransport({
      beforeUpgrade: (_request, context) => {
        if (!allowed(context.headers.get('origin'))) return new Response('Origin not allowed', { status: 403 });
      },
    }),
    rooms: {
      [STATION_ROOM]: defineRoom(
        defineStationRoom({
          name: record.name,
          onAboardChange: (n) => {
            aboard = n;
          },
        }),
      ),
    },
    express: (app) => {
      app.get('/healthz', (_req, res) => {
        res.json(health());
      });
    },
  });
  server.onShutdown(() => db.close());

  await server.listen(config.port);
  await matchMaker.createRoom(STATION_ROOM, {});
  const address = server.transport.server?.address();
  return { port: typeof address === 'object' && address ? address.port : config.port, health };
}

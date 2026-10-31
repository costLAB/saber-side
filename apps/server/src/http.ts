import { createHash, timingSafeEqual } from 'node:crypto';
import {
  type ApiError,
  CLOSED,
  PROTOCOL_VERSION,
  type RobotCard,
  type RosterResponse,
  type StationHealth,
} from '@saber-side/shared';
import express, { type Application, type RequestHandler, type Response } from 'express';
import type { StationControl } from './rooms/station-room.ts';
import type { Roster, RosterResult } from './roster.ts';

export interface RouteDeps {
  roster: Roster;
  health(): StationHealth;
  allowed(origin: string | undefined): boolean;
  /** The owner panel's key (ADMIN_KEY). Unset turns the owner endpoints off. */
  adminKey: string | undefined;
  /** The live room, once it exists, so owner changes reach players who are aboard. */
  station(): StationControl | undefined;
}

/**
 * The HTTP side, next to Colyseus's own /matchmake routes:
 * - `GET /healthz` for Render's health check and uptime monitors
 * - `/api/*` for the roster screen (anyone) and the owner panel (ADMIN_KEY)
 */
export function addRoutes(app: Application, deps: RouteDeps) {
  app.get('/healthz', (_req, res) => {
    res.json(deps.health());
  });

  const api = express.Router();
  api.use(cors(deps.allowed));
  api.use(express.json({ limit: '2kb' }));

  api.get('/roster', (_req, res) => {
    res.json({ protocol: PROTOCOL_VERSION, robots: deps.roster.list() } satisfies RosterResponse);
  });
  api.post('/robots', (req, res) => send(res, deps.roster.create(req.body ?? {}), 201));

  const owner = express.Router();
  owner.use(requireOwner(deps.adminKey));
  owner.get('/check', (_req, res) => {
    res.status(204).end();
  });
  owner.post('/robots/:id/rename', (req, res) => {
    const result = deps.roster.rename(req.params.id, String(req.body?.name ?? ''));
    if (result.ok) deps.station()?.refreshRobot(result.robot);
    send(res, result);
  });
  owner.post('/robots/:id/clear-pin', (req, res) => send(res, deps.roster.clearPin(req.params.id)));
  owner.delete('/robots/:id', (req, res) => {
    deps.station()?.kickRobot(req.params.id, CLOSED.removed);
    if (deps.roster.remove(req.params.id)) res.status(204).end();
    else res.status(404).json({ error: 'No such robot.' } satisfies ApiError);
  });
  api.use('/owner', owner);

  app.use('/api', api);
}

function send(res: Response, result: RosterResult, okStatus = 200) {
  if (result.ok) res.status(okStatus).json(result.robot satisfies RobotCard);
  else res.status(result.status).json({ error: result.error } satisfies ApiError);
}

/**
 * Same rule as matchmaking: only the game's own pages get CORS headers. Requests from other sites' pages are refused
 * outright, so a form on some other page can't create robots either.
 */
function cors(allowed: RouteDeps['allowed']): RequestHandler {
  return (req, res, next) => {
    const origin = req.headers.origin;
    if (!allowed(origin)) {
      res.status(403).json({ error: 'Origin not allowed' } satisfies ApiError);
      return;
    }
    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
      res.setHeader('Access-Control-Allow-Methods', 'GET, POST, DELETE');
    }
    if (req.method === 'OPTIONS') res.status(204).end();
    else next();
  };
}

function digest(s: string) {
  return createHash('sha256').update(s).digest();
}

function requireOwner(adminKey: string | undefined): RequestHandler {
  const want = adminKey ? digest(adminKey) : undefined;
  return (req, res, next) => {
    if (!want) {
      res.status(403).json({ error: 'The owner panel is off. Set ADMIN_KEY on the server.' } satisfies ApiError);
      return;
    }
    const given = /^Bearer (.+)$/.exec(req.headers.authorization ?? '')?.[1];
    if (!given || !timingSafeEqual(digest(given), want)) {
      res.status(401).json({ error: "That isn't the owner key." } satisfies ApiError);
      return;
    }
    next();
  };
}

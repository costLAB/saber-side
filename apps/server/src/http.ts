import { createHash, timingSafeEqual } from 'node:crypto';
import { type ApiError, CLOSED, type LedgerEntry, type OwnerPlayer, type StationHealth } from '@saber-side/shared';
import express, { type Application, type RequestHandler, type Response } from 'express';
import { type Ledger, playerAccount } from './ledger.ts';
import { type Outcome, ownerRobot, type Players } from './players.ts';
import type { StationControl } from './rooms/station-room.ts';

export interface RouteDeps {
  players: Players;
  ledger: Ledger;
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
 * - `/api/owner/*` for the owner panel (ADMIN_KEY). Players come aboard through matchmaking alone: there's no public
 *   list of who's registered.
 */
export function addRoutes(app: Application, deps: RouteDeps) {
  app.get('/healthz', (_req, res) => {
    res.json(deps.health());
  });

  const api = express.Router();
  api.use(cors(deps.allowed));
  api.use(express.json({ limit: '2kb' }));

  const owner = express.Router();
  owner.use(requireOwner(deps.adminKey));
  owner.get('/check', (_req, res) => {
    res.status(204).end();
  });
  owner.get('/players', (_req, res) => {
    const players = deps.players.list().map((p) => ({ ...p, shards: deps.ledger.balance(playerAccount(p.id)) }));
    res.json(players satisfies OwnerPlayer[]);
  });
  owner.post('/players/:id/rename', (req, res) => {
    send(res, deps.players.renamePlayer(req.params.id, String(req.body?.name ?? '')));
  });
  owner.post('/players/:id/reset-pin', (req, res) => send(res, deps.players.resetPin(req.params.id)));
  owner.delete('/players/:id', (req, res) => {
    if (!deps.players.player(req.params.id)) {
      res.status(404).json({ error: 'No such player.' } satisfies ApiError);
      return;
    }
    deps.station()?.kickPlayer(req.params.id, CLOSED.removed);
    // Their balance leaves the world first, so money in minus money out still equals the sum of balances.
    deps.ledger.close(req.params.id);
    deps.players.removePlayer(req.params.id);
    res.status(204).end();
  });
  // The wallet: a player's ledger, grants (positive) and removals (negative), and reversing an entry.
  owner.get('/players/:id/ledger', (req, res) => {
    res.json(deps.ledger.entries(playerAccount(req.params.id)) satisfies LedgerEntry[]);
  });
  owner.post('/players/:id/grant', (req, res) => {
    if (!deps.players.player(req.params.id)) {
      res.status(404).json({ error: 'No such player.' } satisfies ApiError);
      return;
    }
    const reason = String(req.body?.reason ?? '').slice(0, 80) || 'grant';
    const result = deps.ledger.grant(req.params.id, Number(req.body?.shards), reason);
    if (result.ok) deps.station()?.playerChanged(req.params.id);
    send(res, result);
  });
  owner.post('/ledger/:id/reverse', (req, res) => {
    const result = deps.ledger.reverse(Number(req.params.id));
    if (result.ok) {
      for (const account of [result.value.from, result.value.to]) {
        if (account.startsWith('player:')) deps.station()?.playerChanged(account.slice('player:'.length));
      }
    }
    send(res, result);
  });
  owner.post('/robots/:id/rename', (req, res) => {
    const result = deps.players.renameRobot(req.params.id, String(req.body?.name ?? ''));
    if (result.ok) {
      deps.station()?.refreshRobot(result.value);
      deps.station()?.playerChanged(result.value.playerId);
    }
    send(res, result.ok ? { ok: true, value: ownerRobot(result.value) } : result);
  });
  owner.delete('/robots/:id', (req, res) => {
    const result = deps.players.removeRobot(req.params.id);
    if (result.ok) {
      deps.station()?.kickRobot(req.params.id, CLOSED.removed);
      deps.station()?.playerChanged(result.value.playerId);
      res.status(204).end();
    } else send(res, result);
  });
  api.use('/owner', owner);

  app.use('/api', api);
}

function send(res: Response, result: Outcome<unknown>) {
  if (result.ok) res.status(200).json(result.value);
  else res.status(result.status).json({ error: result.error } satisfies ApiError);
}

/**
 * Same rule as matchmaking: only the game's own pages get CORS headers. Requests from other sites' pages are refused
 * outright, so a page on some other site can't use an owner's key either.
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

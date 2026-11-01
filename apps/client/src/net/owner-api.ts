import type { ApiError, LedgerEntry, OwnerPlayer, OwnerRobot, OwnerSettings } from '@saber-side/shared';

/** A refusal from the station's HTTP API, carrying its friendly message (shown as-is in the owner panel). */
export class ApiFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type OwnerApi = ReturnType<typeof ownerApi>;

/**
 * The station server's owner panel, behind ADMIN_KEY. (Players come aboard through matchmaking alone: there's no
 * public list of who's registered.)
 */
export function ownerApi(server: string, key: string) {
  const base = `${server.replace(/^ws/, 'http').replace(/\/+$/, '')}/api/owner`;

  async function call<T>(method: string, path: string, body?: unknown): Promise<T> {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          Authorization: `Bearer ${key}`,
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
    } catch {
      throw new ApiFailure(0, "Can't reach the station right now.");
    }
    if (!res.ok) {
      const err = (await res.json().catch(() => ({}))) as Partial<ApiError>;
      throw new ApiFailure(res.status, err.error ?? `The station answered ${res.status}.`);
    }
    return (res.status === 204 ? undefined : await res.json()) as T;
  }

  const id = encodeURIComponent;
  return {
    check: () => call<void>('GET', '/check'),
    players: () => call<OwnerPlayer[]>('GET', '/players'),
    renamePlayer: (playerId: string, name: string) =>
      call<unknown>('POST', `/players/${id(playerId)}/rename`, { name }),
    resetPin: (playerId: string) => call<unknown>('POST', `/players/${id(playerId)}/reset-pin`, {}),
    removePlayer: (playerId: string) => call<void>('DELETE', `/players/${id(playerId)}`),
    renameRobot: (robotId: string, name: string) => call<OwnerRobot>('POST', `/robots/${id(robotId)}/rename`, { name }),
    removeRobot: (robotId: string) => call<void>('DELETE', `/robots/${id(robotId)}`),
    setCure: (robotId: string, cure: number) => call<OwnerRobot>('POST', `/robots/${id(robotId)}/cure`, { cure }),
    settings: () => call<OwnerSettings>('GET', '/settings'),
    setSettings: (changes: Partial<OwnerSettings>) => call<OwnerSettings>('POST', '/settings', changes),
    ledger: (playerId: string) => call<LedgerEntry[]>('GET', `/players/${id(playerId)}/ledger`),
    grant: (playerId: string, shards: number) =>
      call<LedgerEntry>('POST', `/players/${id(playerId)}/grant`, { shards }),
    reverse: (entryId: number) => call<LedgerEntry>('POST', `/ledger/${entryId}/reverse`, {}),
  };
}

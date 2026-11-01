import type { ApiError, NewRobot, RobotCard, RosterResponse } from '@saber-side/shared';

/** A refusal from the station's HTTP API, carrying its friendly message (shown as-is in the roster screen). */
export class ApiFailure extends Error {
  readonly status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type RosterApi = ReturnType<typeof rosterApi>;

/** The station server's `/api`: the roster anyone can see, and the owner panel behind ADMIN_KEY. */
export function rosterApi(server: string) {
  const base = `${server.replace(/^ws/, 'http').replace(/\/+$/, '')}/api`;

  async function call<T>(method: string, path: string, body?: unknown, ownerKey?: string): Promise<T> {
    let res: Response;
    try {
      res = await fetch(base + path, {
        method,
        headers: {
          ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
          ...(ownerKey ? { Authorization: `Bearer ${ownerKey}` } : {}),
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

  return {
    roster: () => call<RosterResponse>('GET', '/roster'),
    create: (robot: NewRobot) => call<RobotCard>('POST', '/robots', robot),
    owner: (key: string) => ({
      check: () => call<void>('GET', '/owner/check', undefined, key),
      rename: (id: string, name: string) =>
        call<RobotCard>('POST', `/owner/robots/${encodeURIComponent(id)}/rename`, { name }, key),
      clearPin: (id: string) => call<RobotCard>('POST', `/owner/robots/${encodeURIComponent(id)}/clear-pin`, {}, key),
      remove: (id: string) => call<void>('DELETE', `/owner/robots/${encodeURIComponent(id)}`, undefined, key),
    }),
  };
}

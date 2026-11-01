// What this device remembers between visits. Per-device conveniences only: the station's real state lives on the server.
// Storage can be missing or blocked (private browsing), so every access is guarded and the game works without it.

function read(key: string): string | undefined {
  try {
    return localStorage.getItem(key) ?? undefined;
  } catch {
    return undefined;
  }
}

function write(key: string, value: string | undefined) {
  try {
    if (value === undefined) localStorage.removeItem(key);
    else localStorage.setItem(key, value);
  } catch {
    // not remembered; that's fine
  }
}

export const device = {
  /** The username this device last logged in with, to fill in the login form. Never the PIN. */
  get username() {
    return read('saber-side:username');
  },
  set username(name: string | undefined) {
    write('saber-side:username', name);
  },
  /** The owner key, once an owner has unlocked the panel on this device. */
  get ownerKey() {
    return read('saber-side:owner-key');
  },
  set ownerKey(key: string | undefined) {
    write('saber-side:owner-key', key);
  },
};

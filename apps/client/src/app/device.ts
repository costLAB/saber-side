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
  /** The robot this device last came aboard as, so the next visit skips the roster. Never its PIN. */
  get robot() {
    return read('saber-side:robot');
  },
  set robot(id: string | undefined) {
    write('saber-side:robot', id);
  },
  /** The owner key, once an owner has unlocked the panel on this device. */
  get ownerKey() {
    return read('saber-side:owner-key');
  },
  set ownerKey(key: string | undefined) {
    write('saber-side:owner-key', key);
  },
};

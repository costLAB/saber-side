/** How each planet looks: from space (its texture, atmosphere, rings) and on the surface (sky, ground, aliens, scenery). */
export interface PlanetLook {
  /** Painted sphere texture. */
  globe: {
    seed: number;
    base: string;
    land: string[];
    blobs: number;
    caps?: string;
    clouds?: boolean;
    bands?: boolean;
  };
  rings?: boolean;
  sky: number;
  /** Four ground shades; the last also tints the hemisphere light from below. */
  ground: [string, string, string, string];
  alien: number;
  deco: 'trees' | 'rocks' | 'crystals' | 'ice';
}

/** By planet name (see `PLANETS` in @saber-side/shared). */
export const PLANET_LOOKS: Record<string, PlanetLook> = {
  EARTH: {
    globe: {
      seed: 4,
      base: '#1f4f86',
      land: ['#4f7a3a', '#6a8f45', '#a08a5a'],
      blobs: 46,
      caps: '#eef3f6',
      clouds: true,
    },
    sky: 0x8ec5ef,
    ground: ['#5d8a3c', '#6f9a48', '#4f7a34', '#7d6a4a'],
    alien: 0x5fd14b,
    deco: 'trees',
  },
  MARS: {
    globe: { seed: 8, base: '#b5532c', land: ['#8f3f22', '#d07a46', '#6e2f1a'], blobs: 30, caps: '#f0e6dc' },
    sky: 0xd9a066,
    ground: ['#b5532c', '#a2462a', '#c96a3c', '#8a3a22'],
    alien: 0xff8a2a,
    deco: 'rocks',
  },
  GLORP: {
    globe: { seed: 15, base: '#5b2d7a', land: ['#8a3fb0', '#3f1f5a', '#d06ad8'], blobs: 10, bands: true },
    rings: true,
    sky: 0x6b3f8a,
    ground: ['#6a3a8a', '#7d47a0', '#4f2a6a', '#a05cc0'],
    alien: 0x3fe0c8,
    deco: 'crystals',
  },
  FROSTBITE: {
    globe: { seed: 21, base: '#cfe4f0', land: ['#a6c8e0', '#e8f4fa', '#8fb4cf'], blobs: 30 },
    sky: 0xbfd8ea,
    ground: ['#dceaf3', '#c6dceb', '#eef6fb', '#b3cde0'],
    alien: 0xff5fb1,
    deco: 'ice',
  },
};

export function planetLook(name: string): PlanetLook {
  const look = PLANET_LOOKS[name];
  if (!look) throw new Error(`no look for planet ${name}`);
  return look;
}

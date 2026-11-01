import { describe, expect, it } from 'vitest';
import { placeName, STATION_NAME } from './places.ts';

describe('place names', () => {
  it('names the station and its parts, with no measurements', () => {
    expect(placeName({ kind: 'ring' })).toBe(STATION_NAME);
    expect(placeName({ kind: 'lift', lift: 1 })).toBe('Ring Seven · Lift 2');
    expect(placeName({ kind: 'hub' })).toBe('Ring Seven · Hub');
    expect(placeName({ kind: 'airlock' })).toBe('Ring Seven · Airlock');
  });

  it('names space and planets', () => {
    expect(placeName({ kind: 'space' })).toBe('Space');
    expect(placeName({ kind: 'planet', name: 'FROSTBITE' })).toBe('Frostbite');
  });
});

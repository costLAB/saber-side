// Where the player is, as the HUD names it: a place, never a measurement.

/** The station's name. (The server keeps its own copy in the database; this is the default it starts with.) */
export const STATION_NAME = 'Ring Seven';

export type Place =
  | { kind: 'ring' }
  | { kind: 'lift'; lift: number }
  | { kind: 'hub' }
  | { kind: 'airlock' }
  | { kind: 'space' }
  | { kind: 'planet'; name: string };

/** The HUD's name for a place: the station (and which part of it), open space, or the planet you're on. */
export function placeName(place: Place): string {
  switch (place.kind) {
    case 'ring':
      return STATION_NAME;
    case 'lift':
      return `${STATION_NAME} · Lift ${place.lift + 1}`;
    case 'hub':
      return `${STATION_NAME} · Hub`;
    case 'airlock':
      return `${STATION_NAME} · Airlock`;
    case 'space':
      return 'Space';
    case 'planet':
      return place.name.charAt(0).toUpperCase() + place.name.slice(1).toLowerCase();
  }
}

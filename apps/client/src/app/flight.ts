import {
  airlockOpen,
  altitude,
  BOARD_RANGE,
  board,
  climbingOut,
  dock,
  enterSpace,
  type Flight,
  type FlightEvent,
  FT,
  flightFlame,
  HUB_CRADLES,
  type HubCradle,
  landOn,
  launchFlame,
  launchPosition,
  leaveSurface,
  makeFlight,
  OMEGA,
  type Planet,
  type ShipInput,
  stepFlight,
  type XYZ,
} from '@saber-side/shared';
import * as THREE from 'three';
import { buildFlightFx } from '../render/fx/flight-fx';
import type { DrawTexFn, GlowFn, MakeSignFn } from '../render/kit';
import { buildHangar } from '../world/hangar';
import { planetLook } from '../world/planet-looks';
import { buildSurface, type SurfaceScene } from '../world/planet-surface';
import { setFlames } from '../world/ship';
import { buildSpace, type SpaceScene } from '../world/space';

/** What the legacy game hands the flight mode: its camera, input, hub group, a few helpers, and HUD hooks. */
export interface StationKit {
  camera: THREE.PerspectiveCamera;
  /** The real-frame group holding the lift tubes and hub drum (not bent). */
  hub: THREE.Group;
  steel: THREE.Material;
  hazardMap: THREE.Texture;
  capMap: THREE.Texture;
  /** The player's camera orbit (drag, pinch, scroll). */
  orbit: { yaw: number; pitch: number; zoom: number };
  /** Held actions, and actions pressed this frame. */
  keys: Record<string, boolean | undefined>;
  pressed: Record<string, boolean | undefined>;
  drawTex: DrawTexFn;
  makeSign: MakeSignFn;
  glow: GlowFn;
  setWhere(text: string): void;
  /** Shows a hint under the HUD (no key cap); '' hides it. */
  setPrompt(text: string): void;
  /** The ship is back in its cradle: put the robot back in the hub beside it. */
  onDocked(cradle: HubCradle): void;
}

export interface FlightMode {
  /** The sim state (also read by tests through the `?debug` hook). */
  readonly state: Flight;
  /** The scene to draw instead of the station, or null while the station is on screen (docked or launching). */
  readonly scene: THREE.Scene | null;
  /** True during the launch, while the station still needs its own per-frame upkeep. */
  readonly inStation: boolean;
  /** The parked ship within reach of a robot at `p` (real frame), if any. */
  nearestCradle(p: XYZ): { cradle: HubCradle; dist: number } | null;
  board(cradle: HubCradle): void;
  update(dt: number, t: number): void;
}

/** How long the screen stays white while the view switches scenes. */
const FLASH_TIME = 0.3;
const STATION_VIEW = { far: 4000, near: 0.2 };
const SPACE_VIEW = { far: 40000, near: 0.5 };
const SURFACE_VIEW = { far: 6000, near: 0.3 };

/**
 * Flying ships out of the hub: board from a cradle, launch through an airlock, fly between Ring Seven and the
 * planets, zap aliens, and dock back home. The rules live in `@saber-side/shared` (`sim/flight`); this maps input
 * to the sim, and the sim onto the scenes, camera, and HUD.
 */
export function createFlightMode(kit: StationKit): FlightMode {
  const { camera } = kit;
  const flight = makeFlight();
  const hangar = buildHangar(kit.hub, kit);
  const fx = buildFlightFx(kit.glow, flight.lasers.lasers.length);
  const surfaces = new Map<string, SurfaceScene>();
  let space: SpaceScene | null = null;
  let surface: SurfaceScene | null = null;
  let scene: THREE.Scene | null = null;

  const flashEl = document.getElementById('flash');
  const aliensEl = document.getElementById('aliens');
  let pending: (() => void) | null = null;
  let pendingLeft = 0;
  let shownZapped = -1;

  const camPos = new THREE.Vector3();
  const v = new THREE.Vector3();
  const look = new THREE.Vector3();
  const input: ShipInput = { pitch: 0, turn: 0, boost: false, brake: false, fire: false, roll: false };

  const model = () => hangar.ships[flight.cradle?.i ?? 0];
  const setView = (o: { far: number; near: number }) => {
    camera.far = o.far;
    camera.near = o.near;
    camera.updateProjectionMatrix();
  };
  const show = (next: THREE.Scene) => {
    scene = next;
    const m = model();
    if (m) next.add(m.root);
    next.add(fx.root);
    fx.clear();
  };

  /** Whites out the screen, then switches scenes behind it on a later tick. */
  function transition(event: FlightEvent) {
    if (pending) return;
    const s = flight.ship;
    let apply: () => void;
    if (event === 'launched') {
      apply = () => {
        space ??= buildSpace(kit);
        enterSpace(flight);
        hangar.shutAirlocks();
        show(space.scene);
        camPos.set(s.pos.x - (flight.cradle?.end ?? 1) * 16, s.pos.y + 4, s.pos.z);
        setView(SPACE_VIEW);
      };
    } else if (event === 'land') {
      const planet = flight.planet as Planet;
      apply = () => {
        landOn(flight, planet);
        let world = surfaces.get(planet.name);
        if (!world) {
          world = buildSurface(planet, planetLook(planet.name), kit.drawTex);
          surfaces.set(planet.name, world);
        }
        surface = world;
        show(world.scene);
        camPos.set(s.pos.x, s.pos.y + 10, s.pos.z - 15);
        setView(SURFACE_VIEW);
      };
    } else if (event === 'leave') {
      apply = () => {
        leaveSurface(flight);
        surface = null;
        if (space) show(space.scene);
        camPos
          .set(s.pos.x, s.pos.y, s.pos.z)
          .addScaledVector(v.set(flight.exitDir.x, flight.exitDir.y, flight.exitDir.z), -16);
        setView(SPACE_VIEW);
      };
    } else {
      apply = () => {
        const c = flight.cradle;
        dock(flight);
        scene = null;
        fx.clear();
        fx.root.parent?.remove(fx.root);
        if (c) hangar.park(c);
        setView(STATION_VIEW);
        if (c) kit.onDocked(c);
      };
    }
    pending = apply;
    pendingLeft = FLASH_TIME;
    if (flashEl) flashEl.style.opacity = '1';
  }

  function readInput() {
    const { keys, pressed } = kit;
    input.pitch = (keys.up ? 1 : 0) - (keys.down ? 1 : 0);
    input.turn = (keys.left ? 1 : 0) - (keys.right ? 1 : 0);
    input.boost = !!keys.boost;
    input.brake = !!keys.jump;
    input.fire = !!keys.use;
    input.roll = !!pressed.spin;
    return input;
  }

  function update(dt: number, t: number) {
    if (pending) {
      pendingLeft -= dt;
      if (pendingLeft <= 0) {
        const apply = pending;
        pending = null;
        apply();
        if (flashEl) flashEl.style.opacity = '0';
      }
    }
    if (flight.phase === 'docked') return;

    const tick = stepFlight(flight, readInput(), dt, t);
    if (tick.event) transition(tick.event);
    const m = model();
    if (!m) return;

    if (flight.phase === 'launch') {
      const c = flight.cradle as HubCradle;
      const T = flight.launchT;
      launchPosition(c, T, m.root.position);
      hangar.setAirlocks(c.end, airlockOpen(T));
      setFlames(m, launchFlame(T));
      camPos.lerp(v.set(m.root.position.x - c.end * 13, 3.5, 6), 1 - Math.exp(-3 * dt));
      camera.position.copy(camPos);
      camera.up.set(0, 1, 0);
      camera.lookAt(m.root.position);
      kit.setWhere('Launching · airlock open');
      kit.setPrompt('');
      return;
    }

    const s = flight.ship;
    const onSurface = flight.phase === 'surface';
    m.root.position.set(s.pos.x, s.pos.y, s.pos.z);
    m.root.rotation.set(-s.pitch, s.yaw, 0, 'YXZ');
    m.body.rotation.z = s.roll;
    setFlames(m, flightFlame(s, onSurface));

    fx.syncLasers(flight.lasers);
    fx.update(dt, onSurface ? 18 : 0);
    const alienColor = onSurface && flight.planet ? planetLook(flight.planet.name).alien : 0xffffff;
    for (const z of tick.zaps) {
      fx.burst(z, alienColor, 22, 14);
      fx.burst(z, 0xffffff, 8, 8);
    }

    if (onSurface && flight.planet) {
      surface?.sync(flight.aliens.get(flight.planet.name) ?? []);
      kit.setWhere(`${flight.planet.name} · ${Math.round(altitude(flight) / FT)} ft up · climb high to leave orbit`);
      kit.setPrompt(climbingOut(flight) ? 'Keep climbing to return to space' : '');
    } else {
      if (space) space.ring.rotation.x = OMEGA * t;
      const ft = (d: number) => Math.round(d / FT).toLocaleString();
      kit.setWhere(
        `Space · ${flight.nearest.name} ${ft(flight.nearestDist)} ft · Ring Seven dock ${ft(flight.dockDist)} ft`,
      );
      kit.setPrompt('Fly into a planet to land · fly into a glowing Ring dock to return');
    }
    if (flight.zapped !== shownZapped && aliensEl) {
      shownZapped = flight.zapped;
      aliensEl.textContent = String(flight.zapped);
    }

    // chase camera, orbitable by drag and zoomable like the robot's
    const { orbit } = kit;
    const D = 13 * Math.min(orbit.zoom, 2.2);
    v.set(-Math.sin(orbit.yaw) * D, 3.5 + D * 0.15 + orbit.pitch * 8, -Math.cos(orbit.yaw) * D)
      .applyQuaternion(m.root.quaternion)
      .add(m.root.position);
    camPos.lerp(v, 1 - Math.exp(-6 * dt));
    camera.position.copy(camPos);
    camera.up.set(0, 1, 0);
    look.set(0, 0, 6).applyQuaternion(m.root.quaternion).add(m.root.position);
    camera.lookAt(look);
  }

  return {
    state: flight,
    get scene() {
      return scene;
    },
    get inStation() {
      return flight.phase === 'launch';
    },
    nearestCradle(p) {
      if (flight.phase !== 'docked') return null;
      let best: { cradle: HubCradle; dist: number } | null = null;
      for (const c of HUB_CRADLES) {
        const d = Math.hypot(p.x - c.pos.x, p.y - c.pos.y, p.z - c.pos.z);
        if (d < BOARD_RANGE && (!best || d < best.dist)) best = { cradle: c, dist: d };
      }
      return best;
    },
    board(c) {
      board(flight, c);
      camPos.copy(camera.position);
      kit.setPrompt('');
    },
    update,
  };
}

import { HUB_CRADLES, HUB_L, HUB_R, type HubCradle } from '@saber-side/shared';
import * as THREE from 'three';
import type { GlowFn, MakeSignFn } from '../render/kit';
import { buildShip, SHIP_COLORS, type ShipModel, setFlames } from './ship';

/** The ship bay in the hub: four ships in cradles, and an airlock in each end of the drum. */
export interface Hangar {
  /** One per cradle, by cradle index. */
  ships: ShipModel[];
  /** Opens the airlock at one end of the hub (0 shut to 1 open) and shuts the other. */
  setAirlocks(end: 1 | -1, open: number): void;
  shutAirlocks(): void;
  /** Puts a ship back in its cradle in the hub. */
  park(c: HubCradle): void;
}

interface Airlock {
  end: 1 | -1;
  top: THREE.Mesh;
  bottom: THREE.Mesh;
  lamp: THREE.MeshBasicMaterial;
}

const SHUT = 0x4cff7a;
const OPEN = 0xff3a2a;
const DOOR_TRAVEL = 7.4;

/**
 * Builds the hangar into `hub`, the real-frame group that holds the lift tubes and hub drum (it isn't bent, so
 * everything here uses plain materials).
 */
export function buildHangar(
  hub: THREE.Group,
  kit: { glow: GlowFn; makeSign: MakeSignFn; steel: THREE.Material; hazardMap: THREE.Texture },
): Hangar {
  const orange = new THREE.MeshStandardMaterial({ color: 0xc0662a, roughness: 0.55, metalness: 0.3 });
  const cradleGeo = new THREE.TorusGeometry(1.6, 0.18, 6, 24).rotateX(Math.PI / 2);
  const ships = HUB_CRADLES.map((c) => {
    const ship = buildShip(SHIP_COLORS[c.i] ?? 0xffffff, kit.glow);
    hub.add(ship.root);
    // an arm from the drum wall holds a ring under each ship
    const up = Math.sign(c.pos.y);
    const rest = Math.abs(c.pos.y);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.5, HUB_R - rest, 0.5), kit.steel);
    arm.position.set(c.pos.x, up * (rest + (HUB_R - rest) / 2), 0);
    hub.add(arm);
    const cradle = new THREE.Mesh(cradleGeo, orange);
    cradle.position.set(c.pos.x, up * (rest - 0.8), 0);
    hub.add(cradle);
    return ship;
  });

  const frameMat = new THREE.MeshStandardMaterial({ color: 0xc0662a, roughness: 0.5, metalness: 0.3 });
  const doorMat = new THREE.MeshStandardMaterial({
    map: kit.hazardMap,
    roughness: 0.6,
    metalness: 0.3,
    side: THREE.DoubleSide,
  });
  const airlocks: Airlock[] = ([-1, 1] as const).map((end) => {
    const g = new THREE.Group();
    g.position.x = end * (HUB_L / 2 - 0.5);
    hub.add(g);
    g.add(new THREE.Mesh(new THREE.TorusGeometry(7.2, 0.6, 10, 48).rotateY(Math.PI / 2), frameMat));
    const top = new THREE.Mesh(new THREE.CircleGeometry(7, 32, 0, Math.PI).rotateY(Math.PI / 2), doorMat);
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(7, 32, Math.PI, Math.PI).rotateY(Math.PI / 2), doorMat);
    g.add(top, bottom);
    const lamp = new THREE.MeshBasicMaterial({ color: SHUT });
    const bulb = new THREE.Mesh(new THREE.SphereGeometry(0.6, 12, 8), lamp);
    bulb.position.y = 8.6;
    g.add(bulb);
    const signMat = kit.makeSign(256, 64, 'AIRLOCK', 'SHIPS ONLY · SPACE BEYOND', 0x2f3a40, 0xd0702c, 34);
    signMat.side = THREE.DoubleSide;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(6, 1.5), signMat);
    sign.rotation.y = (-end * Math.PI) / 2;
    sign.position.y = 10.3;
    g.add(sign);
    return { end, top, bottom, lamp };
  });

  const hangar: Hangar = {
    ships,
    setAirlocks(end, open) {
      for (const a of airlocks) {
        const k = a.end === end ? open : 0;
        a.top.position.y = k * DOOR_TRAVEL;
        a.bottom.position.y = -k * DOOR_TRAVEL;
        a.lamp.color.setHex(k > 0 ? OPEN : SHUT);
      }
    },
    shutAirlocks() {
      hangar.setAirlocks(1, 0);
    },
    park(c) {
      const ship = ships[c.i];
      if (!ship) return;
      hub.add(ship.root);
      ship.root.position.set(c.pos.x, c.pos.y, c.pos.z);
      ship.root.rotation.set(0, (c.end * Math.PI) / 2, 0);
      ship.body.rotation.set(0, 0, 0);
      setFlames(ship, 1.2);
    },
  };
  for (const c of HUB_CRADLES) hangar.park(c);
  return hangar;
}

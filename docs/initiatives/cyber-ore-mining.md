# Initiative: Mining Cyber Ore and refining it into Cyber Crystals

| | |
| --- | --- |
| **Status** | Planned: next is `feature/ore-planet` |
| **Phase** | P5, Economy v1 ([plan, section 8](../REFACTOR_PLAN.md#p5-economy-v1-l)), after the wallet (players initiative) |
| **Started** | 2026-11-01 |
| **Done when** | A registered kid buys an ore hauler, flies it out to the distant ore planet, drills glowing veins until the hold is full, flies the ore to the Refinery Ring, and watches it come out as Cyber Crystals in their wallet, minus the Refinery's fee. |

The station has two economic threads. The **carrot economy** ([carrot initiative](carrot-economy.md)) is buying,
growing, and selling carrots. This initiative builds the second one: **mining Cyber Ore and refining it into Cyber
Crystals**. Mining is how new crystals come into the world from play, the way cryptocurrency is mined: a kid does the
work, and new coins appear in their wallet. Here the work is a trip: out to a distant planet, drilling ore, and hauling
it to a refinery.

It's cryptocurrency in spirit only. Cyber Crystals are play money in the station's ledger (D7, D8): no blockchain, no
real money, nothing leaves the game.

**Depends on:**

- [Players, their robots, and seats](players-and-robots.md): the wallet belongs to a registered player, and is created
  when a guest registers at the Robot Registry. Guests can't mine. That initiative's `feature/cyber-crystal-wallet`
  builds the ledger, for buying a hauler and getting paid.
- The carrot initiative's `feature/carrot-farmers`, for the items table that holds ore.
- Ships and planets (P1, done): the hauler flies on the same flight sim, and the ore planet is one more planet.

The new places (the ore planet, the Refinery Ring) don't wait on any of these; buying, mining, and refining do.

## Decisions

All by the owner, 2026-11-01.

- **Registering creates a Cyber Crystal wallet.** (Already decided in the players initiative: the Robot Registry
  creates it, starting at zero.)
- **Crystals are mined, like cryptocurrency.** Mining means getting **Cyber Ore** from a **distant planet**.
- **Mining takes a special vehicle**, an **ore hauler**, that can both mine the ore and fly it back.
- **The Refinery is its own ring**, a separate station somewhere in space, and everything on it is dedicated to
  refining Cyber Ore into Cyber Crystals.
- **Refining ore into crystals is the second economic thread**, next to the carrot economy.

These replace two earlier lines in the plan: ore drifting in the zero-g hub, and the Refinery in the hub next to the
Depot. The rate stays: **1 ore chunk → 25 shards, less a 10% fee**.

## Design

### The loop

> Buy an ore hauler → launch from Ring Seven's hub → fly out to the ore planet → land and drill veins until the hold is
> full → fly to the Refinery Ring and dock → the ore is refined → Cyber Crystals land in your wallet, minus the fee →
> spend them (robot parts, farms, shops) or fly another run.

### The ore planet

- **A fifth planet, far out:** about twice as far from Ring Seven as the farthest planet today (Glorp is about 6,900
  out), so a run is a real trip of a few minutes. Proposed name: **Geode**. It's a new entry in `PLANETS`
  (`shared/content/space.ts`), with its own look in `world/planet-looks.ts`: dark rock, deep cracks, and a faint teal
  glow from the ore inside.
- **Veins:** glowing teal crystal outcrops on the surface, about 24 of them, placed as data in
  `shared/content/ore.ts` (position, size). They glow brightly enough to spot from the air, and a vein that's been mined
  out goes dark and then lights back up as it regrows.
- **Veins are shared and server-owned.** Each holds up to 12 chunks and regrows 1 chunk every 5 minutes, worked out
  from the time since it was last looked at (like a farm's growth), so no timer runs per vein. Two kids on the planet
  draw from the same veins, so ore is scarce: the regrowth of every vein together caps how many crystals the station
  can mine in an hour, the way a cryptocurrency caps its new coins.
- No aliens near the veins. The planet is for working.

### The ore hauler

- **Bought, and kept.** A registered player buys a hauler from a kiosk in the hub's hangar (`world/hangar.ts`) with
  Cyber Crystals. It's theirs from then on, parked in its own **hauler bay** in the hangar, next to the shared ships.
  One per player to start; bigger haulers later.
- **It flies like a ship, but heavier:** slower to turn and to speed up (its own numbers in `shared/sim/ship.ts`),
  boxy, with a drill under the nose, a cargo hold behind the cockpit, and a hold gauge in the HUD (`Hold 7 / 12`).
- **No lasers.** Its fire button runs the drill. It can't zap aliens; the shared ships still can.
- **The hold** carries 12 chunks to start. Ore in the hold is stackable items (`catalog_id = 'ore'`) with
  `location_kind = 'hold'` and the hauler as `location_ref`, so it's saved like anything else.
- **Leaving mid-run:** if a kid leaves while flying, the hauler is back in its bay next time, with its ore still in the
  hold. Nothing is lost.
- **Friends:** today nobody sees anyone else's ship. Seeing other haulers out in space and on the planet is a later PR,
  once ship poses are shared.

### Drilling

- **Land on the ore planet** the usual way, fly low over a vein, and hold fire: a drill beam bites into the crystal,
  chunks break off with a crunch, and a tractor beam pulls each one up into the hold.
- **The server owns every chunk** (D7). While drilling, the client asks `mine { vein }` once per chunk. The server
  checks the seat is piloting its own hauler, the hold has room, the vein has ore, and the drill's pace (one chunk per
  1.5 s per seat), then moves a chunk from the vein into the hold and answers with the new counts. Where the hauler is
  stays client-owned, as with other actions.
- **A full hold** stops the drill, and the HUD says to head for the Refinery Ring.

### The Refinery Ring

- **A second, smaller spinning ring** out in space, roughly between Ring Seven and the ore planet, lit orange by its
  smelters. It's a new structure in the space scene (`world/refinery-ring.ts`), with docks off each end like Ring
  Seven's (`RING_DOCKS`, `DOCK_RANGE`).
- **Everything on it is for refining:** ore hoppers at the docks, conveyor belts carrying glowing ore, smelters, crystal
  presses that stamp out Cyber Crystals, and a viewing gallery.
- **First, refining from the dock:** fly within range of a dock and the hauler docks. The hold empties into the hopper,
  the ore rides the conveyor into the smelter, and after a short refining animation (about 10 seconds a load) the
  crystals are paid into the wallet with a cha-ching.
- **Later, walking around inside:** step out of the hauler onto the Refinery Ring's floor, a second ring interior with
  its own ring bend, and watch the line, or (in VR) toss chunks into a hopper by hand. That's a new place
  (`{ kind: 'refinery' }` in `shared/content/places.ts`), and the station room says who's on which ring.
- **The Refinery stays an NPC business** for now. A player-run Refinery that sets its own fee is P7.

### Getting paid

- **The rate is config:** 25 shards per chunk, less a 10% fee. The fee is worked out on the whole load and rounded down
  in the kid's favor: 12 chunks are 300 shards, less 30, so 270 shards (2 ◆ 70).
- **Two ledger entries per load:** 300 shards from the `refinery` source to the player (new money entering the world),
  and 30 back from the player to `refinery` (the fee, leaving it). Shift reports and the owner panel can then show
  ore refined and fees taken.
- **Ore is conserved:** ore drilled = ore refined + ore in holds (+ ore in pockets, once it can be carried or traded).
- **Ore can be traded** between players later (the plan's "ore can also be traded or sold"): unloading to your pocket at
  the dock instead of the hopper, then selling it to a friend or from a shop.

### Starting numbers

All are in config and tunable from the owner panel.

| | Value | Why |
| --- | --- | --- |
| Ore hauler | 20 CC (2,000 shards) | A first big goal from the carrot stand, a bit below a farm plot (25 CC) |
| Hold | 12 chunks | A full hold pays 2 ◆ 70 |
| Ore value | 25 shards a chunk, less a 10% fee | The plan's rate |
| Vein | up to 12 chunks, regrows 1 every 5 minutes | About 24 veins: at most about 290 chunks an hour for the whole station |
| Drill pace | 1 chunk every 1.5 s | A hold fills in about 20 s of drilling, plus finding veins |
| Refining | about 10 s a load | Long enough to watch |

A run of about six minutes pays about 2.7 CC, so the hauler pays for itself in about eight runs. Mining is active play,
so it pays more per hour than a farm, which grows while a kid is away; the veins' regrowth keeps it from flooding the
station with crystals.

### What it adds to the database

The full schema is in the [plan's data model](../REFACTOR_PLAN.md#data-model-sqlite).

```
haulers(id, player_id, kind, bought_at)                   -- one per player to start
veins(vein_id, qty, grown_until)                          -- seeded from shared/content/ore.ts
```

- `haulers.player_id` references `players(id)`, `ON DELETE CASCADE`. A removed player's hold goes with their hauler.
- Ore in a hold is `items` rows (`catalog_id = 'ore'`, `location_kind = 'hold'`, `location_ref` = the hauler).
- The `refinery` ledger account (already listed in the plan) is the source of refined crystals and the sink for fees;
  a `hangar` account is the sink for hauler purchases.

### Protocol

- New messages: `buyHauler`, `mine { vein }`, and `refine`, with results the seat can show (the hold, the vein, the
  payout).
- The station sends vein levels to seats on the ore planet, so dark and lit veins match for everyone.
- Each PR that adds a message or changes what's synced bumps `PROTOCOL_VERSION`.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 1 | Next | `feature/ore-planet` | Put a distant ore planet out in space | Geode in `PLANETS`, its look, and its glowing veins from `shared/content/ore.ts`. Any ship can fly there and land. No mining yet. | none |
| 2 | | `feature/refinery-ring` | Put the Refinery Ring out in space | The second ring with its smelter glow, spinning, between Ring Seven and Geode, with docks: flying in range docks the ship there, and leaving undocks it. The HUD names it. No refining yet. | none |
| 3 | | `feature/ore-hauler` | Let players buy an ore hauler | The hangar kiosk, `haulers`, buying with Cyber Crystals (registered players only), the hauler's bay, model, handling, and hold gauge. Its drill spins but doesn't mine yet. Needs the wallet. | migration (next free), `PROTOCOL_VERSION` bump |
| 4 | | `feature/ore-mining` | Let haulers drill Cyber Ore on the ore planet | `veins` on the server with regrowth, `mine { vein }` with its checks, ore into the hold as items, veins going dark and lighting back up for everyone. Needs the items table. | migration (next free), `PROTOCOL_VERSION` bump |
| 5 | | `feature/ore-refining` | Refine ore into Cyber Crystals at the Refinery Ring | Docking with ore empties the hold into the hopper, the refining animation, the payout and fee in the ledger. From here the whole loop runs. | `PROTOCOL_VERSION` bump |
| 6 | | `feature/refinery-ring-interior` | Let robots walk around inside the Refinery Ring | The second ring interior (conveyors, smelters, presses, the gallery), stepping out of the hauler at the dock, and tossing ore into a hopper by hand. Who's on which ring in the station room. | `PROTOCOL_VERSION` bump |
| 7 | | `feature/ore-economy-tuning` | Tune mining and refining from the owner panel | Every number above editable in the owner panel, and a "last hour" view of ore drilled, refined, and fees. | maybe |

PRs 1 and 2 can merge any time. PRs 3 to 5 come after the wallet (players initiative) and the items table (carrot initiative). The protocol and
migration numbers are whatever's next free when each PR merges.

## Tests

- **Unit:** vein regrowth (the cap, a long time away), the payout and fee rounding, and the hauler's handling numbers.
- **Server:**
  - `mine` refuses a guest, someone else's hauler, a full hold, an empty vein, and a drill faster than its pace.
  - Two kids drilling the last chunk of a vein at once: one gets it.
  - Refining pays once per load, even when two devices race.
  - Ledger invariants hold with the `refinery` and `hangar` accounts, and ore is conserved.
- **E2E:** fly to Geode and land (screenshot with lit and dark veins), the Refinery Ring from space (screenshot), and a
  full run through the `?debug` hook: buy a hauler, drill a hold, dock, and check the wallet in the DOM.

## Risks

| Risk | Mitigation |
| --- | --- |
| Mining floods the station with crystals and makes the carrot economy pointless | Shared veins that regrow slowly cap the crystals mined per hour; every number is in config |
| A kid with nothing can't afford a hauler, so mining is no way back from zero | The first shop's trickle still is; a hauler is bought once and never lost, so after that it always is (see open questions) |
| The trip feels long on an iPad | Distance is data; tune it after watching real runs |
| A second ring interior is a big build on top of `game.js` | The dock-only Refinery (PR 5) is the whole loop; the walkable interior (PR 6) waits until P1 has the ring interior in modules |
| Trusting the client's position lets a hacked client drill from anywhere | Friends-only game; the server still caps the pace and the veins, so it can't mint more than the veins hold |

## Open questions

- **Can a kid mine before they can afford a hauler?** For example a loaner hauler from the Refinery with a small hold
  that keeps a bigger cut, or one free first hauler, like the free first shop. Needed before PR 3.
- **The planet's name.** "Geode" is a placeholder.
- **Should anything else need ore?** Ore only becomes crystals in this doc. Later, crafting (P7) could use ore
  directly, for example to make robot parts.

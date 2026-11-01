# Initiative: Players, their robots, and seats

| | |
| --- | --- |
| **Status** | **Done** (#19, #20, #21, #22). Next comes the carrot initiative's `feature/robot-mouth`. |
| **Phase** | P3, Online free roam ([plan, section 8](../REFACTOR_PLAN.md#p3-online-free-roam-m)), ahead of the carrot initiative's wallet |
| **Started** | 2026-11-01 |
| **Done when** | A kid opens the game, taps **Play**, builds a robot, eats carrots as a guest, walks into the Robot Registry, registers, and from then on logs in with a username and PIN on any device to find their robots, cure, and wallet as they left them, and can buy a second robot with Cyber Crystals. |

Today one `players` row is both the kid and their robot. Where the game is heading, one kid owns many robots: some they
play as, and some that work for them (clerk bots in their shop, farmhand bots on their farm). Money, shops, and farms
belong to the kid, not to any one robot. So this initiative splits three things apart:

- **Player:** the kid. A unique username and a PIN. Owns the Cyber Crystal wallet, shops, farms, robots, the robot
  parts they've bought ([robot parts catalogs](robot-parts-catalog.md)), and an ore hauler
  ([mining](cyber-ore-mining.md)). Only
  registered players are saved.
- **Robot:** a name, a build, a paint cure, a loadout, and a pocket. It's **parked**, **piloted** by a seat, or **on
  duty** (a clerk or farmhand, from P6).
- **Seat:** one connection to the station, piloting at most one robot. The station is still capped at 10 seats, and
  robots on duty don't take one.

It lands before the carrot initiative's `feature/paint-cure`, so the cure is stored on robots from the start. Extra
robots cost Cyber Crystals, so this initiative also builds the wallet (`feature/cyber-crystal-wallet`, moved here from
the carrot initiative), on players from the start.

## Decisions

All by the owner, 2026-11-01.

- **The player is its own layer:** a username and a PIN. There are still no accounts, emails, phone numbers, or
  passwords. The PIN is the whole login, so it's required to register.
- **Usernames are unique**, ignoring case, and kids type theirs to log in. There's no public list of names. The device
  remembers the last username to fill it in, never the PIN.
- **Guests first.** A kid doesn't need to log in to play. **Play** drops them straight in: the first time, they build
  their robot, which then rolls out of the Bot Maker. A guest gets an **auto-generated name** (like "Bot 7").
- **Guests aren't saved.** A guest exists only while the page is open: a reload, a drop longer than the reconnection hold
  (`RECONNECT_SECONDS`, 30 s), or a server restart (so every deploy) loses them.
- **Guests can eat carrots and cure their paint.** That progress is kept when they register. They have no wallet, shops,
  farms, or robots on duty, and only the one robot.
- **The Robot Registry** is a free NPC business right next to the Bot Maker, and the **only** place to register. Signing
  up there turns the guest into a registered player: their robot and its cure are saved, and they create their **Cyber
  Crystal wallet**, which starts at zero. From then on their inventory is saved too.
- **Logging in** happens on the arrival screen (a username and PIN, less prominent than **Play**), or at the Robot
  Registry from inside the game, which switches the seat from the guest over to that player's state and inventory. The
  guest is discarded.
- **The PIN moves from the robot to the player.** Robots have no PIN.
- **One seat per player.** Coming aboard from a second device takes over from the first, even when it pilots a
  different robot. A guest is one player.
- **First come, first served.** A registered player doesn't bump a guest from a full station.
- **Existing robots are wiped.** No migration of the old rows: the next schema migration drops them.
- **The first robot is free. Extra robots cost CC**, paid at the Bot Maker. That keeps "no free money" true once robots
  can work: a robot on duty is labor, so it has to be bought.
- **At most 5 robots per player** for now (`ROBOTS_PER_PLAYER = 5`).
- **Clerks are your own robots.** A clerk (and later a farmhand) is a robot you own, put on duty. There are **no wages
  and no running costs**: the only cost is capex, buying the robot. (Robots on duty arrive in P6.)

## Design

### Arrival

- The arrival screen has one big **Play** button, and below it a smaller **Log in** form: username and PIN, with the
  last username filled in.
- **Play** (first time on this page): the robot builder opens, with no name or PIN fields. Done builds the robot, which
  rolls out of the Bot Maker as a guest.
- **Log in**: the PIN is checked when the seat joins. The player comes aboard as their most recently piloted robot.
  A wrong name and a wrong PIN get the same answer ("That username and PIN don't match"), so names can't be probed.
- **The owner panel** stays reachable from a small **Owner** link on the arrival screen.

### Guests

- A guest's state lives only in the room's memory, on its seat: the auto name, the build, the cure, and the pocket. No
  row is written.
- **Auto names** follow one pattern (`Bot <n>`, the lowest number free among guests aboard), and that pattern is reserved:
  a registered player or robot can't be named `Bot <n>`. So a guest can never look like a registered kid.
- **The Bot Maker** lets a guest rebuild their one robot (the paint-cure rules for repainting apply).
- **What a guest can't do:** hold a wallet, lease a shop, buy a farm, put a robot on duty, or build a second robot. The
  server refuses those requests from guest seats, and the client points them to the Registry instead.
- **Nudges:** the HUD reminds guests where the Robot Registry is ("Register at the Robot Registry to keep your robot"),
  after they build their robot and when they try something only registered players can do.

### The Robot Registry

- A small NPC office **right next to the Bot Maker** on the start plaza (`world/robot-registry.ts`, its spot in
  `shared/content/spawn.ts`). Free. Walk up to its kiosk to open it.
- **Register** (guests): pick a username (unique, ignoring case, the same name rules as robots today, and not `Bot <n>`)
  and a 4-digit PIN, typed twice. The server creates the player, saves the seat's robot under them with its build and
  cure, creates the Cyber Crystal wallet, and turns the seat into that player's seat. The robot is named after the
  username; robots built later get their own names at the Bot Maker.
- **Log in** (guests): username and PIN. The seat switches to that player and their most recently piloted robot; the
  guest robot is discarded. If that player already has a seat on another device, it's taken over (one seat per player).
- Registering and logging in are requests over the seat. Like other actions, the server doesn't check where the robot
  stands (movement is client-owned, D7); the Registry is where the client offers them.
- In VR the kiosk needs an in-world keypad, which waits for P4. Flat screens first.

### Seats

- **One seat per player, enforced by the server.** `#release` in `station-room.ts` matches on the player, not the robot:
  a new seat for a player closes their other connected seat (`CLOSED.replaced`) or lets go of its reconnection hold.
- **A full station doesn't refuse a player taking over their own seat.** Today `onAuth` checks whether the room is full
  before `onJoin` can release the old seat, so a kid who reloads into a full station may see "Station full" while their
  own held seat blocks them. Test it, and release the old seat first.
- **Switching robots in place:** a registered player switching robots at the Bot Maker sends `MESSAGE.pilot { robot }`
  and keeps their seat, instead of leaving and joining again (which today frees the seat for a moment, so someone else's
  retry can take it). The server checks the robot belongs to the seat's player and isn't on duty.
- **Requests are authorized by the seat:** economy requests by the seat's player, pocket requests by the robot it pilots.
  The player is fixed when the seat joins (or registers, or logs in at the Registry), never named by the client later.
- `Aboard` (the synced view of each seat) gains `player` (empty for a guest).

### PINs

- Required for registered players, 4 digits, scrypt-hashed, never stored on the device. Checked when a seat joins with a
  login, and on Register and Log in at the Registry.
- **Lockouts are per player and grow:** 5 wrong tries lock that player for 1 minute, the next 5 for 5 minutes, then 30.
  A correct PIN resets it. (With a flat minute, all 10,000 PINs take about a day and a half to try.)
- **A forgotten PIN:** an owner resets it from the owner panel, and the kid picks a new one at their next login.

### Robots and what they cost

- A registered player has **1 to 5 robots**. The robot they register with is the free one.
- **Building another** at the Bot Maker costs CC, paid from the player's wallet to the `bot_maker` ledger sink (money
  leaving the world). Starting prices (config, tunable from the owner panel later):

  | Robot | Price |
  | --- | --- |
  | 1st | free |
  | 2nd | 10 CC |
  | 3rd | 20 CC |
  | 4th | 30 CC |
  | 5th | 40 CC |

  The price is `10 CC × robots already owned`, so it rises with each one, like extra shops and farm plots.
- The server checks the cap and the balance and charges in one transaction, so two taps can't buy a robot twice, and a
  robot is never made without its payment.
- Removing a robot (owner panel only, for now) doesn't refund it.
- **Rebuilding** a robot you own (new parts or paint) at the Bot Maker is free.
- **On duty (P6):** a robot behind your shop counter is a clerk. It earns no wage and costs nothing per hour; it only
  keeps the shop open (up to 8 hours after you leave). The same goes for farmhands. Since robots aren't free after the
  first, labor is still paid for, once.

### The wallet

Moved here from the carrot initiative, because buying a robot needs it. The design is unchanged: an append-only
`ledger` in shards with balances derived from it, the `12 ◆ 45` HUD readout, everyone starting at zero, owner-panel
grants and reversals, and no negative balances. Guests have none. The Robot Registry opens a player's wallet when they
register. When the owner removes a player, their balance is posted to a `removed` sink first, so money in − money out
still equals the sum of balances.

### The owner panel

- Players: list, rename, reset PIN, remove (with their robots). Once the wallet lands: each player's balance, grants,
  and reversing a ledger entry.
- Robots: rename, remove (kicking the seat piloting it back to the arrival screen).
- Guests aren't listed; there's nothing saved to tidy.

### What it adds to the database

The full schema is in the [plan's data model](../REFACTOR_PLAN.md#data-model-sqlite). Migration 4 drops the old
`players` table (every existing robot goes) and creates:

```
players(id, display_name, pin_hash, created_at)           -- unique display_name, ignoring case
robots(id, player_id, display_name, color, build_json, loadout_json, created_at, piloted_at)
                                                         -- unique display_name, ignoring case
```

- `pin_hash` is `NOT NULL`: a saved player always has a PIN (a reset stores a "pick a new one" marker instead).
- `robots.player_id` references `players(id)`, `ON DELETE CASCADE`.
- `piloted_at` picks the robot a login comes aboard as.
- Limits in config: `PLAYERS_MAX = 60`, `ROBOTS_PER_PLAYER = 5`, replacing `ROSTER_MAX`.
- Migration 5 (with the wallet): `ledger(id, ts, from_acct, to_acct, amount_shards, reason, ref)`.
- Later: `robots.paint_cure` (carrot initiative), and robot duty (a clerk's shop, a farmhand's farm) for P6.

### Protocol

- `JoinRequest` becomes `{ protocol, guest: { build } }` or `{ protocol, login: { name, pin } }`.
- `GET /roster` (the public list of robots) goes away. `POST /robots` is replaced by building at the Bot Maker over the
  seat.
- New messages: `rebuild`, `register`, `login`, `build` (a new robot), and `pilot`, with results the seat can show,
  and a private `wallet` notice to the seat with its player's balance.
- `JOIN_REFUSED.wrongPin` covers a wrong username too. `JOIN_REFUSED.unknownRobot` goes.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 1 | **Done** (#19) | `feature/guest-arrival` | Let kids play straight away as a guest | Migration 4 (the old robots go). The arrival screen: **Play**, the builder with no name or PIN, auto-named guests held in the room's memory, and the **Log in** form with the last username filled in. `players` and `robots` tables, PINs per player with growing lockouts, one seat per player, the full-station takeover fix. Rebuilding your robot at the Bot Maker over the seat. The owner panel on players and robots. Nobody can register until PR 2, so for one PR everyone is a guest. | migration 4, `PROTOCOL_VERSION` 5 |
| 2 | **Done** (#20) | `feature/robot-registry` | Let guests register at the Robot Registry | The Registry office next to the Bot Maker (`world/robot-registry.ts`), its kiosk, Register (username, PIN twice, the robot saved under the new player) and Log in (switching the seat to that player). The HUD nudges for guests. | `PROTOCOL_VERSION` 6 |
| 3 | **Done** (#21) | `feature/cyber-crystal-wallet` | Give every registered player a Cyber Crystal wallet | Moved from the carrot initiative. The append-only ledger in shards, with balances derived from it. The wallet opens when a guest registers; guests have none. The `12 ◆ 45` HUD readout (12 CC, 45 shards), sent privately to the seat. Everyone starts at zero. Owner-panel grants and reversals. Removing a player posts their balance to the `removed` sink. No negative balances. | migration 5 (`ledger`), `PROTOCOL_VERSION` 7 |
| 4 | **Done** (#22) | `feature/several-robots-per-player` | Let registered players keep several robots | Building more robots at the Bot Maker, up to `ROBOTS_PER_PLAYER` (5): the first is free, and each extra one costs 10 CC × robots already owned, paid to the `bot_maker` sink. Picking which to pilot there, and switching in place with `MESSAGE.pilot` so the seat is never let go. | `PROTOCOL_VERSION` 8 |

The protocol and migration numbers assume these PRs merge in this order, before the carrot initiative's PRs that bump
them. If they land in a different order, or another PR takes a number first, use the next free one when you merge.

**Docs that change with the PRs:** `README.md` (how the game opens, and the owner panel) and `docs/HOSTING.md` (the
first-run check) describe today's roster until PR 1 replaces it.

## Tests

- **Server:**
  - A guest comes aboard with no row written, and is gone after leaving or a restart.
  - Logging in with the right PIN, a wrong PIN, and an unknown username (the same refusal), and growing lockouts.
  - A second device for the same player takes over, even piloting a different robot, and lets go of a held seat.
  - A full station lets a player take over their own seat, and still turns away a new one.
  - Register saves the guest's robot (and, once the carrot initiative adds it, its cure) under the new player; a taken
    name or a `Bot <n>` name is refused.
  - Log in at the Registry switches the seat to that player and discards the guest.
  - Guests can't hold a wallet, lease, buy a farm, or build a second robot.
  - A second robot costs 10 CC, a fifth 40 CC, and a sixth is refused; a player who can't pay is refused, and nothing
    is charged. Two taps at once buy one robot.
  - Ledger invariants: money in − money out = the sum of balances, including after a player is removed.
  - `pilot` switches robots without the seat being let go, and refuses another player's robot.
  - Owner panel: rename, reset a PIN, remove a player and their robots (kicking their seat).
- **E2E:** Play → build → roll out as `Bot 1`. The Log in form fills in the last username. Register at the Registry,
  reload, log in, and the same robot comes back. A screenshot of the Registry next to the Bot Maker.

## Risks

| Risk | Mitigation |
| --- | --- |
| iPad Safari reloads background tabs on its own, so a guest who switches apps can lose their robot | The HUD nudges to register; if it bites often, keep guests across reloads (not devices) in `sessionStorage` |
| A forgotten PIN locks a kid out of everything they've saved | The owner panel resets it |
| A 4-digit PIN is the whole login | Lockouts that grow; it only guards play money among friends |
| Every deploy drops every guest | Expected; deploys are short and the client rejoins, but guests come back as new guests |

## Open questions

- **Where do guests get carrots to cure with?** Guests can cure, but with no wallet they can't buy carrots, and the free
  carrot on the table is a snack that doesn't cure ([carrot initiative](carrot-economy.md)). Options: the snack carrot
  cures guests only, perhaps up to a cap (say 25%); or friends hand guests carrots, which needs a pocket for guests and
  counts a guest leaving as carrots leaving the world. Needed before the carrot initiative's `feature/carrot-farmers`.

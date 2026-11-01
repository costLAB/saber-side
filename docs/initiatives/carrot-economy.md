# Initiative: Building the carrot and Cyber Crystal economy

| | |
| --- | --- |
| **Status** | In progress: step 0 done (#13); next is `feature/robot-mouth`. [Players, their robots, and seats](players-and-robots.md) lands before `feature/paint-cure`, and builds the wallet |
| **Phase** | The first slice of P5, Economy v1 ([plan, section 8](../REFACTOR_PLAN.md#p5-economy-v1-l)) |
| **Started** | 2026-11-01 |
| **Done when** | A kid starting with nothing opens a free carrot stand, earns its trickle, buys carrots from the Farmers, eats them and watches the paint cure, sells carrots to friends, saves 25 CC, buys a farm, and turns the stand into a money-maker. |

Carrots are the first thing every player wants, because eating them is how a robot grows into its chosen colors. That
gives the economy steady demand from day one: friends buy carrots from each other's stands to cure their paint. So
Economy v1 is built carrot-first, and the rest of P5 (sabers, blasters, hats, pets, ore, the Depot) follows on the same
ledger.

The wider economy this fits into (currency, shops, rent, robot shoppers, guardrails, the data model) is in
[section 3 of the plan](../REFACTOR_PLAN.md#3-the-economy-core-game-loop).

## Decisions

All by the owner, 2026-11-01.

- **The currency is Cyber Crystals, "CC" for short** (100 Cyber Shards = 1 CC). The ledger counts shards.
- **Paint cures by eating carrots.** A robot's paint is a see-through coat over its original skin. A fresh coat starts
  at **10%**, and **each carrot eaten adds 1 percentage point**, up to the chosen color at full opacity (100%). So a
  fresh coat takes 90 carrots to reach full color.
- **Robots made before paint cure start a fresh coat at 10%**, like everyone else. Nobody has earned their paint yet,
  and everyone starts level.
- **Every carrot is 1 point** in this initiative. Golden and giant carrots, perhaps worth more, can come later.
- **Robots eat with a mouth.** On the big-eye head, the panel seam just below the eye is the mouth: a chunk of the skull
  below it swings down on a hinge to gulp the carrot.
- **Carrots come from the Farmers** (NPC growers on the ring farms), not the Depot.
- **Any shop can be a carrot stand.** Stocking from the Farmers leaves a thin margin. A player with enough CC can
  **buy a farm**, grow their own carrots, and make the stand very profitable.
- **A farm's bin is capped**, at 60 carrots, so a farm doesn't keep piling up carrots while a kid is at school.
- **The free carrot on the table is a snack.** It respawns every few seconds, so it doesn't cure paint.

## Design

### Paint cure

- **One cure value per robot**, from 0 to 100 (%), kept by the server: in `robots.paint_cure` for registered players'
  robots, and in the room's memory for a guest's, until the guest registers at the Robot Registry and it's saved. It applies to every painted part at once. Parts
  left in their original skin don't change.
- **How it looks:** each painted part draws its coat over the skin texture as `mix(skin, coat, cure)`. The coat is the
  chosen paint, lit by the skin's own light and shade, so the panel seams, rivets, grime, and bump still read through
  faintly at 100%. That matters because the mouth opens on one of those seams.
  - Today's `tint` (a flat multiply in `avatar/parts/kit.ts`) becomes a `coat` material with one `uCure` uniform.
    `partKit` already gives each robot its own painted copies, so every robot can have its own cure.
  - A coat that's still curing looks a little glossy, like wet paint, and goes to the skin's roughness at 100%.
  - When a carrot lands, the change eases in over about a second.
- **Rates (config):** a fresh coat starts at 10%, and each carrot adds 1 point (`CURE_PER_CARROT = 1`). The cure is
  capped at 100. A fully cured robot can still eat carrots for fun, with the animation and no effect.
- **Where it shows:** the HUD (`Paint 37%`), and the roster and builder, which show the target color with a cure ring.
  The builder can preview the robot at 100%, so a kid sees what they're working toward.
- **Repainting** a part, once the Bot Maker can do that, starts a fresh coat at 10%.
- **Rule location:** `packages/shared/src/sim/paint-cure.ts`, plain functions such as `cureAfter(cure, carrots)` and
  `freshCoat()`, so the server and client agree.

### Eating, with a mouth

- **Controls:** hold a carrot and press use (F, the Use button, or in VR, bring the carrot up to the face). The arm
  brings the carrot to the mouth and the jaw swings open. Each of the existing **three bites** is a chomp, with the jaw
  snapping shut and crumbs flying. The last bite is a **gulp**: the jaw closes, the head bobs, and the body squashes a
  little. The server credits the cure on the gulp, so one carrot is one point.
- **The big-eye dome's jaw:** the head texture has a horizontal panel seam at `v = 0.63` (`seamsV` in `game.js`), about
  23° below the skull's equator and just under the eye's rim. The skull splits there.
  - The jaw is the front chunk of the skull below that seam, about 120° wide. It hangs from a hinge group whose axis is
    horizontal, running through the seam's two back corners, and it swings down about 35° to open.
  - A dark mouth cavity (`M.dark`) sits behind it.
  - Closed, it lines up with the skull, so the robot looks as it does today.
  - A partial `SphereGeometry` gets UVs from 0 to 1 over its own range. Remap them to the full sphere's UVs so the
    texture and the seam line up across the cut.
  - Keep the skull's `scale.y = 0.9` on the meshes, not on the hinge group, so the swing doesn't shear.
- **The other heads:** the visor's jaw is the chin below its brim. The stalk eye's ball splits along a new horizontal
  seam under its eye; its existing seam ring is vertical. A robot with no head eats through a hatch that flips open on
  the front of its body. Every robot has to be able to eat, since that's how it cures.
- **Friends see it:** the jaw angle is a new `jaw` field in the pose (`pose.ts`), which needs a `PROTOCOL_VERSION` bump.
- **Animation code:** the eating timeline (bite times, and the jaw angle over time) is pure data in
  `shared/sim/eating.ts`. The jaw meshes go in `avatar/parts/head.ts` (`BuiltHead.jaw`), and the glue in
  `app/eating.ts`. The legacy bite code only calls a hook.

### Carrot stands, the Farmers, and farms

- **The Farmers** are NPC growers with a **Farm Stand** out on the ring farms (`x` 116 to 161, by the silos and barns).
  They sell carrots wholesale for shards, with unlimited stock, and that money leaves the world. The trip out to the
  farms matters the way the lift ride to the Depot does.
- **Any shop can be a carrot stand.** Buy carrots from the Farmers, put them on your shelves, and set a price. Friends
  buy them to eat. Robot shoppers buy them too, with the usual demand curve against the carrot's reference price.
  Buying from the Farmers leaves a thin margin. That's on purpose: the stand covers its rent, but you won't get rich.
- **Your own farm:** with enough CC you can buy a **farm plot** on the farm strips. It's capex, and each extra plot
  costs more.
  - A plot grows carrots in real time, even while you're away, into a bin of 60. A full bin stops growing, so you have
    to come back.
  - Each carrot grown costs a small **seed fee**, and nothing else.
  - Walk up to the bin to pull the carrots into your pocket, then stock your stand with them. A delivery bot that
    carries them for you can be an upgrade later.
  - Farm carrots cost almost nothing to stock, so a stand fed by your own farm is **very profitable**.
- **Where carrots go:** carrots enter the world only from the Farmers and from farms. They leave only by being eaten or
  bought by robot shoppers. Tests check that carrots are conserved, just like shards.

### Starting numbers

All are in config and tunable from the owner panel.

| | Value | Why |
| --- | --- | --- |
| Farmers' wholesale price | 8 shards per carrot | |
| Carrot reference price (what robot shoppers think is fair) | 10 shards | A stand stocked from the Farmers earns about 2 shards a carrot. |
| First farm plot | 25 CC (2,500 shards) | It takes a while of running a stand to save up. |
| Farm growth | 1 carrot every 2 minutes, bin of 60 | A full bin lasts 2 hours of being away. |
| Seed fee | 1 shard per carrot grown | A farm-fed stand earns about 9 shards a carrot, 4.5 times as much. |
| Paint cure | starts at 10%, +1 point per carrot | A full coat takes 90 carrots, about 9 CC at a friend's stand. |

The plot pays for itself after about 280 carrots sold, roughly 9 hours of growing.

### What it adds to the database

The full schema is in the [plan's data model](../REFACTOR_PLAN.md#data-model-sqlite).

- `robots.paint_cure` (guests' cure isn't saved until they register)
- `plots` and `farms` tables
- carrots as stackable items (`catalog_id = 'carrot'`), in a pocket, on a shelf, or in a farm's bin
- the `farmers` and `seed` ledger accounts, beside each registered player's wallet

A farm's growth is worked out from the time since `grown_until`, capped by the bin, and posted when someone looks at
the farm or at settlement, so no timer runs per farm.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 0 | **Done** (#13) | `foundation/cosmetic-rng` | Keep screenshots stable when the scene changes | Cosmetic effects have their own seeded RNG (D2), so adding the jaw's meshes doesn't shift screenshots. | none |
| 1 | Next | `feature/robot-mouth` | Let robots open their mouths to eat carrots | The jaw on every head (the dome's seam, the visor's chin, the stalk's new seam, and a body hatch on a robot with no head). The eating timeline in `shared/sim/eating.ts`: three chomps and a gulp, with crumbs. Friends see it through the new `jaw` pose field. Eating is still just a snack: no rules change. | `PROTOCOL_VERSION` 9 |
| 2 | | `feature/paint-cure` | Let robot paint cure from a sheer coat to full color | The `coat` material with `uCure`, which has to work alongside the ring bend's `onBeforeCompile` patch. `shared/sim/paint-cure.ts`. Each robot's cure is stored on `robots` (a guest's is held by the room and saved when they register), starts at 10%, is sent with the roster card and the aboard view, and is shown in the HUD, roster, and builder (with a 100% preview). The owner panel can set a robot's cure. The server credits a gulp only for a carrot from your pocket, and pocket carrots arrive with PR 5. Until then, a station setting (`paintCure`, in `settings_json`) leaves every coat drawn at 100%, so robots don't sit pale before carrots can be bought. | migration 6 (`robots.paint_cure`), `PROTOCOL_VERSION` 10 |
| 3 | Moved | `feature/cyber-crystal-wallet` | Give every registered player a Cyber Crystal wallet | Moved to [Players, their robots, and seats](players-and-robots.md) (its PR 3, #21), because buying a second robot needs the wallet. It lands before this initiative's PR 1. | — |
| 4 | | `feature/first-shop` | Let players open their first shop | Spots as data, the "FOR LEASE" kiosk, and the free first shop, open while its owner is aboard. The window-shopper trickle against rent, 5-minute settlement, and "Closed for repairs". For now, shelves hold carrots only. | migration 7 (`spots`, `shops`), `PROTOCOL_VERSION` 11 |
| 5 | | `feature/carrot-farmers` | Sell carrots at the Farmers' stand | The Farm Stand on the ring farms (a `world/` builder), the pocket inventory (`items`), buying carrots wholesale, and eating pocket carrots to cure. The owner turns on `paintCure` once this ships. From here the whole loop runs: trickle → buy → eat → cure. | migration 8 (`items`), `PROTOCOL_VERSION` 12 |
| 6 | | `feature/carrot-stand` | Let players sell carrots from their shops | Stocking shelves from your pocket, and price tags. Friends buy by tapping or clicking (VR waits for P4). Robot shoppers buy carrots by the demand curve, posted at settlement. A simple shift report. | `PROTOCOL_VERSION` 13 |
| 7 | | `feature/carrot-farms` | Let players buy a farm and grow their own carrots | Farm plots as data (`shared/content/farms.ts`) on the farm strips, and the plot kiosk. Capex in CC that rises with each plot. Growth worked out from time, up to the bin cap, with the seed fee. Pulling a bin into your pocket, and rows that visibly fill (`world/farm-plot.ts`). | migration 9 (`plots`, `farms`), `PROTOCOL_VERSION` 14 |
| 8 | | `feature/economy-tuning` | Tune the carrot economy from the owner panel | Every carrot, cure, farm, and shop number editable in the owner panel. A "last hour" view, and "While you were away" for farms that grew. | maybe |

The protocol and migration numbers assume the PRs merge in this order, after the four PRs of [Players, their robots, and seats](players-and-robots.md) (migrations 4 and 5, protocol 5 to 8). If they land in a different order, or another
PR takes a number first, use the next free one when you merge.

## Tests

- **Unit:** cure math (the start, the cap, and that a fully cured robot eats with no effect), the eating timeline, farm
  growth (the bin cap, the seed fee, a long time away), and the demand curve for carrots.
- **Server:**
  - A gulp credits only a carrot from your pocket, and a carrot is never counted twice when two devices race.
  - Ledger invariants: money in − money out = the sum of balances.
  - **Carrots are conserved:** carrots from the Farmers + carrots grown = carrots eaten + carrots bought by robot
    shoppers + carrots in pockets, on shelves, and in bins.
  - Two kids buying the last carrot on a shelf at once.
- **E2E:** an "eat a carrot" action that checks the jaw angle and the cure through the `?debug` hook. A close-up
  screenshot mid-gulp, and painted robots at 10% and 100%.

## Risks

| Risk | Mitigation |
| --- | --- |
| The paint coat's shader fights the ring bend (both use `onBeforeCompile`, and `tint` copies drop the bend flag today) | One shader-patch helper that chains patches, plus a screenshot of a painted robot on the bent floor and in real space |
| Curing to full color feels like a grind, or goes too fast | `CURE_PER_CARROT`, the starting cure, and carrot prices are config, tunable from the owner panel; watch real play before changing them |
| The jaw's cut shows a gap or a texture jump when closed | UVs remapped to the full sphere, plus a close-up screenshot of the closed head next to today's |
| Kids sit with pale robots before they can buy carrots | `paintCure` stays off until PR 5 ships |

## Open questions

- **Where do guests get carrots to cure with?** Guests can cure, but have no wallet to buy carrots with. Tracked in
  [Players, their robots, and seats](players-and-robots.md#open-questions); needed before `feature/carrot-farmers`.

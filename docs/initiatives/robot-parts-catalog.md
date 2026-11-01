# Initiative: Robot parts catalogs

| | |
| --- | --- |
| **Status** | Planned: next is `feature/jack-o-lantern-head` |
| **Phase** | P3 (the builder) and P5 (prices), after [Players, their robots, and seats](players-and-robots.md) |
| **Started** | 2026-11-01 |
| **Done when** | A registered kid walks into the Bot Maker, flips through a catalog for each kind of part, buys a jack-o-lantern head and a pair of thrusters with Cyber Crystals, paints them in a new color, rolls out, and flies across the zero-g hub while a friend on an iPad sees exactly that robot. |

Today a robot is built from four slots (mobility, body, head, arms) with three choices in most of them, ten paints, and
everything free. This initiative turns the builder into a set of **catalogs**, one for each kind of part, with more
parts, more colors, and prices in Cyber Crystals. The parts are the first big thing worth saving up for, so they give
both economies something to spend on: the carrot stands ([carrot initiative](carrot-economy.md)) and mining
([Cyber Ore initiative](cyber-ore-mining.md)).

**Depends on [Players, their robots, and seats](players-and-robots.md).** Parts are bought by a **player** from their
wallet and fitted to any of their **robots**, so the player/robot split has to land first. Buying also needs the
wallet, which that initiative builds (`feature/cyber-crystal-wallet`). The new parts themselves (the head, colors, slots) don't wait on
either; only the prices do.

## Decisions

All by the owner, 2026-11-01.

- **The kinds of parts**, each with its own catalog:
  - **Mobility:** what the robot moves on. Today that's just the giant drive sphere (the `wheel` part). Tires and
    others come later.
  - **Body coverings:** the shell over the mobility, covering either the giant ball or the tires. Today's bodies (rust
    ball, barrel, crate) are body coverings for the ball.
  - **Heads**, including a new **cute jack-o-lantern head**.
  - **Arms**.
  - **Voice:** voice boxes and microphones, so a kid can talk to other players.
  - **Eyes**.
  - **Thrusters**, for moving in zero gravity.
- **More parts and more colors** across every catalog.
- **Everything costs Cyber Crystals.**

## Design

### Slots

The build grows from four slots to seven. In code, `PART_SLOTS` in `shared/content/robot-parts.ts` becomes:

| Slot | Shown as | Required | Mounts on | Today |
| --- | --- | --- | --- | --- |
| `mobility` | Mobility | yes | the robot's core | the drive sphere (`wheel`) |
| `body` | Body covering | no | the mobility (it must fit it) | rust ball, barrel, crate |
| `head` | Head | no | the covering's neck (or the bare mobility's) | big eye, visor, stalk eye |
| `eyes` | Eyes | no | the head's eye sockets | part of each head |
| `arms` | Arms | no | the covering's shoulders | grabbers, pincers, noodles |
| `voice` | Voice | no | the covering's chest, or the head | none |
| `thrusters` | Thrusters | no | the covering's back | none |

- **The `body` id stays** in code and in saved builds, so old builds still read; only the label changes to "Body
  covering".
- **Coverings fit a mobility.** Each covering lists the mobility parts it fits (`fits: ['wheel']`). The builder only
  offers coverings that fit, and `cleanRobotBuild` refuses a build that doesn't. A tire covering is a fender or a
  chassis; a ball covering is a shell.
- **Eyes split from heads.** Each head declares its **eye sockets**: how many, where, and how big. An eye part draws
  one eye per socket. The big-eye dome's red lens becomes the `lens` eye part, so the classic robot is the dome with
  the lens and draws byte-identically. A head with no eyes picked has dark, empty sockets. A robot with no head puts
  its eyes on the covering's face sockets, or has none.
- **The classic build** gains `eyes: lens`, and `voice` and `thrusters` stay empty.
- **Saved builds** with no `eyes` field read as the head's original eyes, so a migration isn't needed to read them.

### The jack-o-lantern head

A cute pumpkin, not a scary one:

- **Shape:** a squat sphere (about 0.85 tall to 1 wide) with eight soft ribs: the radius rises and falls around the
  sphere, so the grooves catch the light. A short, curly green stem on top, and one little vine tendril that curls off
  to the side.
- **Face:** two big round-cornered triangle eyes, tilted up at the outer corners to look happy, a tiny triangle nose,
  and a wide grin with two square teeth, top and bottom. The face is carved: the holes are cut into the shell, and
  inside is a warm glow.
- **The glow:** an emissive inner shell (orange-yellow, a little flicker from the cosmetic RNG), with no point light
  (D9, lights budget). It shows through the carved holes, so the face lights up the same in VR and on an iPad.
- **Eyes:** its sockets are the carved triangles. The default `candle` eye part is just the glow, so the classic look
  is a lit pumpkin. Other eyes sit in the triangles (a pumpkin with googly eyes is the point of separate eyes).
- **Paint:** the default skin is pumpkin orange with darker grooves. Paint tints the skin, and the stem keeps its
  green. Paint cure (carrot initiative) works on it like on any part.
- **Eating:** the grin is the jaw. The lower lip of the grin, from corner to corner, hinges down to take a carrot, and
  the teeth go with it. If `feature/robot-mouth` merges first, the head ships with its jaw; if not, that PR adds it.
- **Code:** `avatar/parts/head.ts` gains `pumpkin`, built from a lathe of the ribbed profile. The carved holes are an
  alpha-tested texture on the outer shell over the emissive inner shell, so there's no extra geometry per hole.

### More parts

A first batch, so every catalog has a real choice. Parts are procedural like everything else: each is a builder in
`avatar/parts/`, and adding a variant is mostly a catalog entry.

| Catalog | New parts |
| --- | --- |
| Mobility | (tires and treads come in their own PR, below) |
| Body coverings | Fishbowl (a glass dome over the ball), Teapot, Gumball machine, Trash can |
| Heads | Jack-o-lantern, TV set (with a screen face), Bucket, Lightbulb, Fishbowl helmet |
| Eyes | Lens (today's big red eye), Twin bulbs, Googly, LED strip, Camera, Candle (the pumpkin's glow) |
| Arms | Wrenches, Claws (the crane-game kind), Spoons, Springs |
| Voice | Voice box (a speaker grille), Mic antenna, Walkie-talkie, Megaphone |
| Thrusters | Puffers (small, slow), Jet pack (twin), Rocket (one big one) |

### More colors

- `ROBOT_COLORS` grows from 10 to about 24, in the same pastel family, with a few deep ones: Pumpkin, Tangerine,
  Cherry, Cream, Sand, Forest, Teal, Navy, Lilac, Plum, Coral, Snow, and Midnight among them.
- **Finishes** come after: metallic (lower roughness, higher metalness), glow (emissive), and glitter (a sparkle
  texture). A finish is a separate pick from the color, so a kid can have Metallic Pumpkin.
- Colors stay one shared list for every part, and paint cure applies to every one.

### Voice parts

- **Talking needs a voice part.** A robot with one shows a talk button (or push-to-talk in VR) once proximity voice
  chat exists (plan, [section 7](../REFACTOR_PLAN.md#7-voice-chat-later-phase)). Its voice comes out of the part on
  the robot: the `PannerNode` sits on the voice part, not the head.
- **Voice parts can change how a kid sounds:** a megaphone carries further, a walkie-talkie crackles, and a voice box
  goes a little robotic (a WebAudio filter on the sender's side).
- **The mic permission** is still asked for only when the kid first presses talk.
- Until voice chat ships, voice parts are cosmetic, and the catalog says "Talking comes soon".

### Thrusters

- **In the zero-g hub,** a robot with thrusters flies with the controls it has today: thrust along its own axes. The
  thrusters flare when it thrusts, and friends see the flare.
- **Without thrusters,** a robot can still move in the hub, but slowly: little puffs from its own body (today's thrust,
  at a fraction of the strength), so no kid gets stuck. Pushing off walls with arms comes with P4.
- **Rates (config, per thruster part):** thrust strength, top speed, and how fast it turns.
- **Where the rule lives:** `shared/sim/zero-g.ts` gets the thrust from the build (`thrustOf(build)`), so the zero-g
  step doesn't care which part it is.
- Later, thrusters can also matter outside: walking on the ring's outer hull, or a space walk from a ship.

### Tires

- New mobility parts: **Two tires** (a balancing scooter), **Four tires**, and **Treads**. They roll on the same
  movement as the drive sphere, with a different look and a little different handling (config: speed, turning,
  wobble).
- **Coverings for tires** fit over them: a chassis, a go-kart frame, a bathtub. Ball coverings don't fit tires, and the
  reverse.
- The robot's turning animation is per mobility: the sphere spins, tires turn and roll, treads crawl.

### Owning parts

- **A player owns parts, not a robot.** Buying a part puts it in the player's collection, and any of their robots can
  wear it, as many robots at once as they like. Robots on duty (clerks, farmhands) can wear them too.
- **Colors work the same way:** buying a color lets every part of every robot be painted in it.
- **Starter parts and colors are free:** today's parts (the drive sphere, the three bodies, the three heads with their
  original eyes, the three arms) and today's 10 colors. So a guest, who has no wallet, can still build their robot.
- **Guests build only from the free parts.** The catalog shows them the rest with prices, and points them to the Robot
  Registry.
- **Robots keep what they wear.** If an owner removes a part from a player's collection, robots wearing it keep it until
  they're rebuilt.
- **The Bot Maker's catalogs** are the NPC store for parts. Selling parts in player shops (so a kid can run a parts
  store) is later, once parts are items (see open questions).

### Prices

All in config, all tunable from the owner panel. A starting point, against the carrot numbers (a farm plot is 25 CC, a
fully cured coat of paint about 9 CC):

| | Price | Why |
| --- | --- | --- |
| Starter parts and colors | free | Guests build from them |
| A new color | 1 CC | Cheap and fun; paint still has to cure |
| A finish (metallic, glow, glitter) | 5 CC | |
| Eyes | 2 to 4 CC | |
| Arms, voice parts | 3 to 6 CC | |
| Heads, body coverings | 5 to 10 CC | The jack-o-lantern at 8 CC |
| Thrusters | 8 to 20 CC | They change how you play |
| Tires and treads | 10 to 20 CC | |

Money spent on parts leaves the world through the `bot_maker` ledger sink, the same one extra robots are paid to
([players initiative](players-and-robots.md#robots-and-what-they-cost)). Fitting parts you own to a robot is free, like
any rebuild at the Bot Maker.

### What it adds to the database

The full schema is in the [plan's data model](../REFACTOR_PLAN.md#data-model-sqlite).

```
owned_parts(player_id, slot, part_id, bought_at)          -- unique (player_id, slot, part_id)
owned_paints(player_id, paint, bought_at)                 -- unique (player_id, paint)
```

- Both reference `players(id)`, `ON DELETE CASCADE`. Free parts and colors aren't stored; everyone has them.
- `robots.build_json` gains the new slots. Reading an old build fills them in (`eyes` from the head's original,
  `voice` and `thrusters` empty).
- A purchase is one transaction: a ledger entry from the player to `bot_maker` and the `owned_parts` row, or neither.
- The server checks every part and paint in a build the seat sends is free or owned by the seat's player.

### Protocol

- Every new part or color needs a `PROTOCOL_VERSION` bump: an older client's `cleanRobotBuild` refuses an id it
  doesn't know, so it couldn't draw a friend's robot.
- New messages: `buyPart { slot, part }` and `buyPaint { paint }`, with results. The aboard view and the arrival
  payload send the player's collection.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 1 | Next | `feature/jack-o-lantern-head` | Add a jack-o-lantern head to the Bot Maker | The pumpkin head: ribbed shell, curly stem, carved happy face with an emissive glow, its grin as the jaw if the robot mouth has landed. Free for now, like every part. A close-up screenshot. | `PROTOCOL_VERSION` bump |
| 2 | | `feature/more-paint-colors` | Give robots more paint colors | `ROBOT_COLORS` to about 24, a wider swatch grid in the builder. Free for now. | `PROTOCOL_VERSION` bump |
| 3 | | `foundation/seven-part-slots` | Split robots into seven kinds of parts | `eyes`, `voice`, and `thrusters` slots; eye sockets on every head and the eyes split out (the dome's lens, the visor's band, the stalk's ball, the pumpkin's candle); coverings that fit a mobility; old builds read with the new slots filled in. The builder lists every slot. The classic robot draws byte-identically, and every baseline stays unchanged. | `PROTOCOL_VERSION` bump |
| 4 | | `feature/more-robot-parts` | Fill the Bot Maker with more robot parts | The new heads, coverings, eyes, and arms from the table above, and voice parts as cosmetics. A screenshot sheet of every part. | `PROTOCOL_VERSION` bump |
| 5 | | `feature/parts-catalog` | Let players buy robot parts with Cyber Crystals | The catalog per slot at the Bot Maker, prices, `owned_parts` and `owned_paints`, buying from the wallet, the server checking builds against what the player owns, guests limited to free parts. The owner panel can grant a part. Needs the wallet. | migration (next free), `PROTOCOL_VERSION` bump |
| 6 | | `feature/robot-thrusters` | Let thrusters fly robots in zero gravity | The thruster parts, `thrustOf(build)` in `shared/sim/zero-g.ts`, slow puffs for robots without them, flares friends can see (a `thrust` pose field). | `PROTOCOL_VERSION` bump |
| 7 | | `feature/robot-tires` | Let robots roll on tires and treads | Two tires, four tires, treads, and coverings that fit them. Handling per mobility in config. | `PROTOCOL_VERSION` bump |
| 8 | | `feature/talking-robots` | Let robots with voice parts talk to each other | Talking gated on a voice part, voice coming from the part, and each part's sound. Lands with, or right after, proximity voice chat (P6). | `PROTOCOL_VERSION` bump |

PRs 1 to 4 don't need the wallet or the player split and can merge any time; PR 5 needs both. The protocol and
migration numbers are whatever's next free when each PR merges, after the
[players](players-and-robots.md) and [carrot](carrot-economy.md) initiatives' numbers.

## Tests

- **Unit:**
  - `cleanRobotBuild` with every new part, a covering that doesn't fit its mobility, an old build with no `eyes`, and an
    unknown id.
  - `thrustOf` for each thruster part and for none.
- **Server:**
  - Buying a part takes the price and records it once, even when two devices race; buying with too little is refused.
  - A build with a part or paint the player doesn't own is refused; free parts always pass; guests can't buy.
  - Ledger invariants still hold with `bot_maker` as a sink.
- **E2E:** a screenshot sheet of every part in its default skin, a close-up of the jack-o-lantern (lit), and the classic
  robot unchanged. Buying a part through the catalog and seeing it on the turntable. Flying across the hub with and
  without thrusters (DOM-checked speed through the `?debug` hook).

## Risks

| Risk | Mitigation |
| --- | --- |
| Splitting eyes from heads changes how the classic robot draws, and the screenshot baselines | The dome with the lens builds its objects in the legacy order; PR 3 is a refactor that must keep every baseline unchanged |
| More parts mean more draw calls for every robot on screen | Merge each robot's static meshes per material after it's built; watch the Quest frame time with 10 robots |
| Prices feel out of reach next to the carrot trickle | Starter parts stay free; every price is config, tunable from the owner panel |
| The pumpkin's carved holes alias or flicker in VR | Alpha-to-coverage on the outer shell, and a VR close-up check in P4 |

## Open questions

- **Are parts unlocks or items?** This doc makes them unlocks: buy once, every robot can wear it. Items (one part, worn
  by one robot at a time) would let kids sell and trade parts in their shops, which suits the shop game, but means
  buying the same head twice for two robots. Needed before PR 5.
- **Does hearing need a part too?** This doc lets everyone hear, and only robots with a voice part talk. The other way
  is that a microphone is how a robot hears others. Needed before PR 8.
- **Do thrusters matter beyond the hub?** Flying in the hub is enough to start; the hull or space walks would come
  later.

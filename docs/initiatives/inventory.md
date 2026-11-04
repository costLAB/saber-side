# Initiative: Inventory v1: what you own, and giving to friends

| | |
| --- | --- |
| **Status** | Planned: next is the parts initiative's `feature/jack-o-lantern-head` |
| **Phase** | P3 (giving held items) and P5 (buying and giving crystals) |
| **Started** | 2026-11-04 |
| **Done when** | A registered kid buys the jack-o-lantern head for Cyber Crystals at the Bot Maker, sees it in their inventory, wears it, drives up to a friend and gives them a lit saber, then sends them 2 CC for a carrot, and the friend sees both arrive. |

Today a robot holds one item in its hand, nothing it holds is owned or saved, and every robot part is free. The
[carrot initiative](carrot-economy.md) adds a pocket for carrots (its PR 5, `items`), and the
[parts initiative](robot-parts-catalog.md) plans buying parts with Cyber Crystals (its PR 5). This initiative brings
those together into an **inventory**: one place that shows what a player owns, starting with the pumpkin head, and
lets them **give** things to friends.

## Decisions

All by the owner, 2026-11-04.

- **v1 is wearables and giving.** Carrying several items in a backpack and VR holsters (grabbing items from your hip
  or shoulder) aren't in v1.
- **The pumpkin head is the first wearable, and it's a head part.** It's the jack-o-lantern head the
  [parts initiative](robot-parts-catalog.md#the-jack-o-lantern-head) already designs: it replaces the robot's head,
  and its grin is the mouth. It's fitted at the Bot Maker like any part. Owning it shows in the inventory.
- **It's bought with Cyber Crystals**, at the parts initiative's price for it (8 CC), so it's saved to a registered
  player. Guests see it but can't buy it.
- **What can be given:** **held items** (sabers, blasters, carrots) and **Cyber Crystals**. Parts and wearables
  can't be given.
- **Held items stay shared toys.** Sabers and blasters on the station aren't owned by anyone: giving one just passes it
  from your hand to a friend's. Carrots are kept, because the pocket saves them.
- **Handing over, on an iPad or Mac:** drive up to a friend and press **Give**. The item goes into their hand if it's
  free. In VR, let go of the item in a friend's grabber.
- **Giving crystals:** pick a friend who's aboard, enter an amount, and confirm. Both see a notice. No daily cap.
  Balances still can't go below zero.

### Proposed here, for the owner to confirm

- **Who can give crystals:** only registered players have wallets, so only registered players can send or receive
  crystals. A guest sees the button with a nudge to register.
- **The inventory sheet** opens from a HUD button (and from the wrist panel in VR, once it exists). It shows your
  crystals, the robots you own, the parts you've bought, and, once the carrot initiative's PR 5 lands, your pocket.
  It's read-only in v1: fitting parts still happens at the Bot Maker.
- **Robots already wearing the pumpkin keep it.** When it starts costing CC, players whose robots wear the free one
  are given it in the migration, so nobody's robot changes under them.
- **Give needs a free hand.** If your friend is already holding something, Give says so and nothing moves.

## Design

### The pumpkin head, bought ahead of the rest of the catalog

- The parts initiative builds the head (its PR 1, free at first). This initiative's PR 1 then makes it the first part
  that costs crystals: it brings forward that initiative's `owned_parts` table and `buyPart` message for this one
  part, so the rest of the catalog (its PR 5) builds on them instead of adding them.
- A purchase is one transaction: a ledger entry from the player to `bot_maker` and the `owned_parts` row, or neither.
  The server refuses a build with a part the player doesn't own.

### Giving crystals

- A ledger entry from `player:<giver>` to `player:<friend>` with the reason `gift`. Nothing new in the database.
- `MESSAGE.give { to, shards }`, answered with a notice to both seats, and both wallets sent again.
- The confirm step is on the giver's screen: "Give Zed 2 ◆ 00?" with Give and Cancel.

### Giving held items

- **Needs the server to know who holds what.** Today pickup and drop happen on each device, which is why the plan
  lists server-authoritative pickup and drop as a P3 item. This initiative builds it as a foundation PR: the server
  owns each item's holder, and a pickup or drop is a request it approves.
- With that in place, Give is a request to move the item from your hand to your friend's, and the friend's hand pose
  takes it. In VR, letting go of an item inside a friend's grabber sends the same request.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 0 | Next, in the parts initiative | `feature/jack-o-lantern-head` | Add a jack-o-lantern head to the Bot Maker | The [parts initiative's PR 1](robot-parts-catalog.md#the-prs): the pumpkin head, free for now. | `PROTOCOL_VERSION` bump |
| 1 | | `feature/inventory` | Let players buy the pumpkin head and see what they own | The inventory sheet (crystals, robots, owned parts, and later the pocket). `owned_parts` and `buyPart`, brought forward from the parts initiative, for the pumpkin head at 8 CC. Robots already wearing it keep it. | migration (next free), `PROTOCOL_VERSION` bump |
| 2 | | `feature/give-crystals` | Let players give Cyber Crystals to friends | Pick a friend aboard, an amount, confirm, `gift` in the ledger, a notice to both. | `PROTOCOL_VERSION` bump |
| 3 | | `foundation/server-held-items` | Let the station keep track of who holds what | Server-authoritative pickup and drop (the plan's P3 item): the server owns each item's holder, and pickup, drop, and throw are requests it approves. Sabers and blasters stay shared toys. | `PROTOCOL_VERSION` bump |
| 4 | | `feature/give-items` | Let players hand items to friends | The **Give** prompt near a friend on flat devices, letting go in a friend's grabber in VR, and a held carrot moving pockets. | `PROTOCOL_VERSION` bump |

## Risks

| Risk | Mitigation |
| --- | --- |
| A kid is talked into giving away all their crystals | The confirm step names the friend and the amount; the owner panel can reverse a gift |
| Server-authoritative pickup makes grabbing feel laggy | Show the item in your hand straight away and roll back only if the server refuses, which is rare among friends |
| Parts PR 5 and this PR 1 both build `owned_parts` | This PR builds it; parts PR 5 builds on it (its row in the parts doc says so) |

## Open questions

1. **The pumpkin head's price:** 8 CC (the parts doc's starting price), or something else?
2. **Later versions:** a backpack for carrying several items, VR holsters, and giving parts and wearables are out of
   v1. Which comes first after it?

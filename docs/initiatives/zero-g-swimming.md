# Initiative: Swimming in zero gravity

| | |
| --- | --- |
| **Status** | Planned: next is `feature/zero-g-swim-stroke` |
| **Phase** | P4 (the VR stroke) and P3 (the swim move for every device) |
| **Started** | 2026-11-04 |
| **Done when** | A kid in a Quest rides a lift to the hub, pulls a breaststroke through the air and glides across the drum, while a friend on an iPad swims alongside with the swim button. Then they step out of the airlock together and swim around outside the station. |

Today a robot in the zero-g hub floats with thrust: the arrow keys (or the left stick in VR) push it along its own
axes, jump pushes it "up", it drifts, and it bounces off the drum (`legacy/game.js`, "riding the lifts and floating
in the hub"). This initiative makes zero-g movement **swimming**: you pull yourself through the air with your arms.

## Decisions

All by the owner, 2026-11-04.

- **Stroke through the air.** A Quest player swims by pulling their arms back, like a breaststroke, to glide the way
  they're facing. It works from anywhere, in open space too: no wall to push off is needed. The glide slows down
  gradually, so you coast between strokes.
- **Everyone can swim.** iPad and Mac players get a swim move (a button, a key), so flat players swim too, not just
  Quest players.
- **Where:** the hub; **spacewalks** outside the station (a new feature: step out of an airlock into open space); and
  the Refinery Ring's zero-g areas, once the [mining initiative](cyber-ore-mining.md) builds them.
- **Walking in VR is separate.** Pushing off the floor Gorilla Tag style stays in the
  [Quest VR initiative](quest-vr.md) (its PR 5), and covers the ring floor only. The hub's VR movement moves here.

### Proposed here, for the owner to confirm

- **One set of rules for every device.** A stroke is an impulse along the robot's facing, scaled by how hard you pull
  and capped. VR measures the pull from both hands' speed backward relative to the head; flat devices play a fixed
  stroke. Both feed the same `swim` rules, so a Quest player and an iPad player swim at the same top speed.
- **The flat swim move:** in zero-g, holding forward (up arrow, W, or the touch stick pushed forward) strokes in a
  rhythm, about one stroke a second, instead of today's steady thrust. Jump strokes "up" (away from your feet). Boost
  makes the strokes harder.
- **Stick floating stays as a VR comfort option**, for kids who'd rather not swing their arms, and it uses the same
  stroke rhythm as the flat move.
- **Friends see the stroke.** The robot's arms sweep through a breaststroke, through the pose fields that already
  carry the arm angles, so no protocol change is needed for the hub.
- **Thrusters** (a robot part, [parts initiative](robot-parts-catalog.md) PR 6) still come later and stack on top:
  swimming is the free way around, and thrusters are the fast one.

## Design

### The stroke (`shared/sim/swim.ts`)

- `strokeImpulse(handVelocities, headFrame)`: the backward speed of both hands, relative to the head, past a small dead
  zone, turned into a push along the way you face. Two hands pulling together count fully; one hand pulling turns
  you slightly toward the other side, the way a one-armed stroke does in water.
- **Glide:** speed decays slowly (a drag factor per second, in config), with a top speed cap. Today's bounce off the
  drum stays.
- **Rhythm** for the flat move and stick floating: a stroke every `SWIM_STROKE_S` (about 1 s) while forward is held.
- All numbers in config: dead zone, stroke strength, drag, top speed, rhythm.

### Spacewalks

- **Out and back:** from the hub, a new airlock door (next to the ships' airlock) lets a robot float out into open
  space around the station, in the real frame the ships already use.
- **Can't get lost:** a gentle pull back toward the station starts past a set distance, and a "Back to the airlock"
  prompt returns you (a fade, then you're inside). Kids can't drift off forever.
- **Ships keep flying.** Robots outside are drawn and synced like ships are, so friends see each other out there. A
  robot's place gains a `space` kind, which is a protocol bump.

### Testing

- **Unit:** stroke impulse (dead zone, cap, two hands vs one, turning), glide decay, rhythm, the pull-back past the
  limit.
- **E2E:** a flat robot in the hub holds forward and glides, and stops gliding after a while; an emulated Quest
  (IWER) pulls both controllers back and moves forward; a spacewalk out and back through the airlock.
- **Manual:** swim the hub on a Quest for five minutes and check nobody feels sick, before each VR PR merges.

## The PRs

Each PR branches from `main`, merges on its own, and leaves the game playable. Update the status here as each one
merges.

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 1 | Next | `feature/zero-g-swim-stroke` | Let robots swim through the zero-g hub | `shared/sim/swim.ts`, the glide and drag, the flat swim move (forward strokes in a rhythm, jump strokes up), and the breaststroke arm animation friends see. Replaces today's steady hub thrust. | none |
| 2 | | `feature/vr-swimming` | Let Quest players swim with their arms | The VR stroke from both hands' speed, one-armed turning, and stick floating as a comfort option. Takes over the hub half of the Quest VR initiative's PR 5. | none |
| 3 | | `feature/spacewalks` | Let robots swim outside the station | The hub airlock door, open space around the station, the pull back past the limit, "Back to the airlock", and robots outside synced for friends. | `PROTOCOL_VERSION` bump |
| 4 | Waiting on the mining initiative | `feature/refinery-ring-swimming` | Let robots swim in the Refinery Ring | Swimming in the Refinery Ring's zero-g areas, once its interior is built (mining PR 6). | maybe |

## Risks

| Risk | Mitigation |
| --- | --- |
| Arm-swinging in zero-g makes kids sick | Glide on your own strokes only (no automatic motion), the comfort vignette, stick floating as an option, short playtests |
| Flat players are faster or slower than Quest players | One `swim` rule set with the same cap for every device |
| Kids drift off into space and can't get back | The pull back past a set distance, and "Back to the airlock" |
| Quest players flail and hit their real furniture | Strokes need only a short pull; the stroke strength is tuned so small motions are enough |

## Open questions

1. **Spacewalk limit:** how far from the station may a robot swim before the pull back starts?
2. **Ships and swimmers:** can a ship bump into a swimming robot, or do they pass through each other?

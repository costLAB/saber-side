import type { Room } from '@colyseus/sdk';
import {
  CHARACTERS,
  classicBuild,
  MESSAGE,
  NOTICE,
  POSE,
  type StationView,
  TAIL_GRAB,
  type TailAnswer,
  type TailGrab,
  wearCharacter,
} from '@saber-side/shared';
import { describe, expect, it } from 'vitest';
import { boot, comeAboard, until } from './test-helpers.ts';

// Grabbing a friend's tail (sim/tail-grab.ts): the station checks each grab against the poses it holds, and shows who
// holds which tail on the cat's seat for everyone aboard.

const snatch = wearCharacter(classicBuild(), CHARACTERS[0] as (typeof CHARACTERS)[number]);

/** Stands a robot at x, z (shown, upright). */
function stand(room: Room<unknown, StationView>, x: number, z: number, shown = true) {
  const at: Record<string, number> = { px: x, pz: z, qw: 1, squashX: 1, squashY: 1, shown: shown ? 1 : 0 };
  room.send(
    MESSAGE.pose,
    POSE.map(([name]) => at[name] ?? 0),
  );
}

const seatOf = (room: Room<unknown, StationView>, id: string) => room.state.players?.get(id);

/** Waits until `room` sees `id` standing at x. */
const standing = (room: Room<unknown, StationView>, id: string, x: number) =>
  until(() => (seatOf(room, id) as unknown as { px?: number } | undefined)?.px === x, `${id} to stand at ${x}`);

/** Collects the refusals a seat is sent. */
function refusals(room: Room) {
  const seen: TailAnswer[] = [];
  room.onMessage(NOTICE.tail, (a: TailAnswer) => seen.push(a));
  return seen;
}

const grab = (room: Room, target: string, segment = 5, hand = 1) =>
  room.send(MESSAGE.grabTail, { target, segment, hand } satisfies TailGrab);

describe("grabbing a friend's tail", () => {
  it('pins the tail to whoever grabs it in reach, for everyone, and lets go when asked', async () => {
    const server = await boot();
    const cat = await comeAboard(server, { guest: { build: snatch } });
    const me = await comeAboard(server);
    const friend = await comeAboard(server);
    stand(cat, 3, 0);
    stand(me, 0, 1.5);
    await standing(me, cat.sessionId, 3);
    await standing(cat, me.sessionId, 0);
    expect(seatOf(friend, cat.sessionId)?.tailHeldBy).toBe('');

    grab(me, cat.sessionId, 6, 1);
    // Every client sees it, the friend watching included: who holds it, where, and with which hand.
    await until(() => seatOf(friend, cat.sessionId)?.tailHeldBy === me.sessionId, 'the friend to see the grab');
    expect(seatOf(friend, cat.sessionId)).toMatchObject({ tailSegment: 6, tailHand: 1 });
    expect(seatOf(cat, cat.sessionId)?.tailHeldBy).toBe(me.sessionId);

    me.send(MESSAGE.letGoTail);
    await until(() => seatOf(friend, cat.sessionId)?.tailHeldBy === '', 'the tail to be let go');
  });

  it('refuses a grab past the reach, and a tail on a robot without one', async () => {
    const server = await boot();
    const cat = await comeAboard(server, { guest: { build: snatch } });
    const me = await comeAboard(server);
    const told = refusals(me);
    stand(cat, TAIL_GRAB.reach + 1, 0);
    stand(me, 0, 0);
    await standing(me, cat.sessionId, TAIL_GRAB.reach + 1);
    await standing(cat, me.sessionId, 0);

    grab(me, cat.sessionId);
    await until(() => told.length === 1, 'the refusal');
    expect(told[0]).toEqual({ ok: false, target: cat.sessionId, error: 'Too far away.' });
    expect(seatOf(me, cat.sessionId)?.tailHeldBy).toBe('');

    // A classic robot has no tail to grab, however near.
    stand(cat, 1, 0);
    await standing(me, cat.sessionId, 1);
    const catTold = refusals(cat);
    grab(cat, me.sessionId);
    await until(() => catTold.length === 1, "the cat's refusal");
    expect(catTold[0]?.error).toBe("That robot hasn't got a tail.");
  });

  it('gives a tail two robots grab at once to one of them only', async () => {
    const server = await boot();
    const cat = await comeAboard(server, { guest: { build: snatch } });
    const a = await comeAboard(server);
    const b = await comeAboard(server);
    const toldA = refusals(a);
    const toldB = refusals(b);
    stand(cat, 0, 0);
    stand(a, 2, 0);
    stand(b, -2, 0);
    await standing(a, b.sessionId, -2);
    await standing(b, a.sessionId, 2);
    await standing(a, cat.sessionId, 0);

    grab(a, cat.sessionId, 4, 1);
    grab(b, cat.sessionId, 7, 0);
    await until(() => toldA.length + toldB.length === 1, 'one of them to be refused');
    const winner = toldA.length ? b : a;
    expect((toldA[0] ?? toldB[0])?.error).toBe('Someone has that tail.');
    await until(() => seatOf(cat, cat.sessionId)?.tailHeldBy === winner.sessionId, 'the winner to hold it');
    // Still held by the winner a moment later: the loser's grab changed nothing.
    await new Promise((r) => setTimeout(r, 100));
    expect(seatOf(cat, cat.sessionId)?.tailHeldBy).toBe(winner.sessionId);
  });

  it('lets go when they pull too far apart, when the cat spins free, and when the grabber leaves', async () => {
    const server = await boot();
    const cat = await comeAboard(server, { guest: { build: snatch } });
    const me = await comeAboard(server);
    stand(cat, 0, 0);
    stand(me, 2, 0);
    await standing(cat, me.sessionId, 2);
    await standing(me, cat.sessionId, 0);
    const held = () => seatOf(cat, cat.sessionId)?.tailHeldBy;

    // Pulled past the stretch limit, the grip breaks.
    grab(me, cat.sessionId);
    await until(() => held() === me.sessionId, 'the grab');
    stand(cat, -(TAIL_GRAB.breakAt + 1), 0);
    await until(() => held() === '', 'the grip to break');

    // The cat shakes it free with a spin attack.
    stand(cat, 0, 0);
    await standing(me, cat.sessionId, 0);
    grab(me, cat.sessionId);
    await until(() => held() === me.sessionId, 'the second grab');
    cat.send(MESSAGE.shakeTail);
    await until(() => held() === '', 'the tail shaken free');

    // The grabber leaves.
    grab(me, cat.sessionId);
    await until(() => held() === me.sessionId, 'the third grab');
    await me.leave();
    await until(() => held() === '', 'the tail let go when the grabber leaves');
  });

  it('lets go when the cat rebuilds without its tail', async () => {
    const server = await boot();
    const cat = await comeAboard(server, { guest: { build: snatch } });
    const me = await comeAboard(server);
    stand(cat, 0, 0);
    stand(me, 2, 0);
    await standing(me, cat.sessionId, 0);
    await standing(cat, me.sessionId, 2);
    grab(me, cat.sessionId);
    await until(() => seatOf(me, cat.sessionId)?.tailHeldBy === me.sessionId, 'the grab');
    cat.send(MESSAGE.rebuild, { ...snatch, body: { part: 'barrel', paint: snatch.mobility.paint } });
    await until(() => seatOf(me, cat.sessionId)?.tailHeldBy === '', 'the tail let go');
  });
});

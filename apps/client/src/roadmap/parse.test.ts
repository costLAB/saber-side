import { describe, expect, it } from 'vitest';
import { ROADMAP_DOCS } from './docs';
import { type DocFiles, parseRoadmap } from './parse';

const PLAN = `# Plan

## Initiatives

### Build order

Some words.

1. \`fix/ring-sprites\` (#31): Draw dust again
2. \`feature/b\`
3. \`feature/a-done\`
4. \`feature/b\`

### Not split into PRs yet

- **Tidy up the code (P1):** meters, and the rest.

## 8. Phases

### Where we are (2026-11-01)

| Phase | Status | Done | Still to do |
| --- | --- | --- | --- |
| P0 Groundwork | **Done** | Everything | |
| P1 Decompose | **Partly done** | some | more |
| P2 Input + avatar | Not started | | all |
`;

const ALPHA = `# Initiative: Alpha things

| | |
| --- | --- |
| **Status** | In progress |
| **Phase** | P5 |
| **Done when** | A kid does **the thing**. |

## The PRs

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 1 | **Done** (#12) | \`feature/a-done\` | Do A | The A. | none |
| 2 | Moved | \`feature/moved\` | Moved away | Elsewhere. | none |
| 3 | Next | \`feature/b\` | Do B | The B. | none |
| 4 | | \`feature/c\` | Do C | The C. | none |

### Follow-ups

| # | Status | Branch | PR title | What it changes | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 5 | **Done** (#40) | \`fix/a-fix\` | Fix A | A fix. | none |

## Tests
`;

const BETA = `# Initiative: Beta

| | |
| --- | --- |
| **Phase** | P3 |
| **Done when** | Beta works. |

## The PRs

| # | Status | Branch | PR title | What it adds | Protocol / schema |
| --- | --- | --- | --- | --- | --- |
| 0 | Next, in the alpha initiative | \`feature/b\` | Do B | See alpha. | none |
| 1 | Waiting on alpha | \`feature/d\` | Do D | The D. | none |
`;

const DOCS: DocFiles = {
  '../docs/REFACTOR_PLAN.md': PLAN,
  '../docs/initiatives/alpha.md': ALPHA,
  '../docs/initiatives/beta.md': BETA,
};

describe('parseRoadmap', () => {
  const roadmap = parseRoadmap(DOCS);

  it('ranks what is left in the build order, then anything the order leaves out', () => {
    expect(roadmap.upNext.map((pr) => [pr.rank, pr.branch, pr.status])).toEqual([
      [1, 'fix/ring-sprites', 'open'],
      [2, 'feature/b', 'next'],
      [undefined, 'feature/c', 'planned'],
      [undefined, 'feature/d', 'waiting'],
    ]);
    expect(roadmap.upNext[0]).toMatchObject({ title: 'Draw dust again', prs: [31], initiatives: [] });
  });

  it('shares a PR between the initiatives that list it, with the owning row’s plain status', () => {
    const b = roadmap.upNext[1];
    expect(b).toMatchObject({ title: 'Do B', note: '', initiatives: ['alpha', 'beta'] });
  });

  it('reads each initiative, leaves out moved PRs, and orders initiatives by their next PR', () => {
    expect(roadmap.initiatives.map((i) => i.slug)).toEqual(['alpha', 'beta']);
    const alpha = roadmap.initiatives[0];
    expect(alpha).toMatchObject({ name: 'Alpha things', phase: 'P5', goal: 'A kid does **the thing**.' });
    expect(alpha?.prs.map((pr) => pr.branch)).toEqual(['feature/a-done', 'feature/b', 'feature/c', 'fix/a-fix']);
  });

  it('lists done PRs newest first', () => {
    expect(roadmap.done.map((pr) => [pr.branch, pr.prs])).toEqual([
      ['fix/a-fix', [40]],
      ['feature/a-done', [12]],
    ]);
  });

  it('reads the later list and the phases', () => {
    expect(roadmap.later).toEqual([{ title: 'Tidy up the code (P1)', text: 'meters, and the rest.' }]);
    expect(roadmap.phases).toEqual([
      { id: 'P0', name: 'Groundwork', status: 'done' },
      { id: 'P1', name: 'Decompose', status: 'started' },
      { id: 'P2', name: 'Input + avatar', status: 'not-started' },
    ]);
  });
});

describe('the real docs', () => {
  const roadmap = parseRoadmap(ROADMAP_DOCS);

  it('reads the plan and every initiative', () => {
    expect(Object.keys(ROADMAP_DOCS).some((p) => p.endsWith('REFACTOR_PLAN.md'))).toBe(true);
    expect(roadmap.initiatives.length).toBeGreaterThanOrEqual(7);
    for (const i of roadmap.initiatives) {
      expect(i.goal, i.slug).not.toBe('');
      expect(i.prs.length, i.slug).toBeGreaterThan(0);
    }
    expect(roadmap.phases.map((p) => p.id)).toEqual(['P0', 'P1', 'P2', 'P3', 'P4', 'P5', 'P6', 'P7']);
    expect(roadmap.done.length).toBeGreaterThan(0);
    expect(roadmap.later.length).toBeGreaterThan(0);
  });

  it('ranks every planned PR in the plan’s build order', () => {
    // A new row in an initiative's PR table needs a line in docs/REFACTOR_PLAN.md, "Build order", so the Roadmap
    // knows when it comes.
    expect(roadmap.upNext.filter((pr) => pr.rank === undefined).map((pr) => pr.branch)).toEqual([]);
  });
});

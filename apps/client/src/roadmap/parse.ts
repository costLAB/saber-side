// The Roadmap, read straight out of the docs: the plan's build order and phase table (docs/REFACTOR_PLAN.md) and each
// initiative's PR table (docs/initiatives/*.md). Nothing here is typed in twice, so the hut in the park shows whatever
// the docs say. Text keeps its light markdown (`code`, **bold**, [links](...)); the page renders it.

/** Where a PR stands. `open` is a PR that's up for review; `waiting` is planned but held up by something else. */
export type PrStatus = 'done' | 'open' | 'next' | 'planned' | 'waiting';

export interface RoadmapPr {
  branch: string;
  title: string;
  /** What it adds, from the PR table (empty for a branch that's only in the build order). */
  what: string;
  status: PrStatus;
  /** The status cell's own words, when it says more than done or not ("Waiting on the mining initiative"). */
  note: string;
  /** Its PR numbers: the merged ones when done, the open one when open. */
  prs: number[];
  /** Its place in the build order (1 is next), if it's ranked. */
  rank?: number;
  /** The initiatives whose PR tables list it, by slug. */
  initiatives: string[];
}

export interface Initiative {
  /** The doc's file name without `.md`. */
  slug: string;
  name: string;
  phase: string;
  /** "Done when": the goal, as the kid would see it. */
  goal: string;
  /** Its PRs in table order, the ones moved to other initiatives left out. */
  prs: RoadmapPr[];
}

export interface Phase {
  /** "P4" */
  id: string;
  /** "Quest VR" */
  name: string;
  status: 'done' | 'started' | 'not-started';
}

export interface LaterItem {
  title: string;
  text: string;
}

export interface Roadmap {
  /** Everything still to do, in build order: ranked first, then any planned PR the order leaves out. */
  upNext: RoadmapPr[];
  /** Initiatives ordered by when their next PR comes up, finished ones last. */
  initiatives: Initiative[];
  /** Every merged PR from the initiatives, newest first. */
  done: RoadmapPr[];
  later: LaterItem[];
  phases: Phase[];
}

/** Doc files by path; the plan is the one ending in `REFACTOR_PLAN.md`, initiatives are under `initiatives/`. */
export type DocFiles = Record<string, string>;

const BRANCH = /`([a-z]+\/[a-z0-9-]+)`/;

export function parseRoadmap(files: DocFiles): Roadmap {
  const planPath = Object.keys(files).find((p) => p.endsWith('REFACTOR_PLAN.md'));
  const plan = planPath ? (files[planPath] ?? '') : '';
  const initiatives = Object.entries(files)
    .filter(([path]) => /initiatives\/[^/]+\.md$/.test(path))
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([path, text]) => parseInitiative(slugOf(path), text));

  // One record per branch, shared by every initiative that lists it (a PR can start two initiatives at once).
  const byBranch = new Map<string, RoadmapPr>();
  for (const initiative of initiatives) {
    initiative.prs = initiative.prs.map((pr) => {
      const seen = byBranch.get(pr.branch);
      if (!seen) {
        byBranch.set(pr.branch, pr);
        return pr;
      }
      seen.initiatives.push(initiative.slug);
      // The row that owns the PR has its plain status; the other one just points at it ("Next, in the parts
      // initiative"). Keep the plainer note, and a done from either.
      if (pr.status === 'done') Object.assign(seen, { status: 'done', prs: pr.prs, note: '' });
      else if (seen.note.length > pr.note.length && seen.status !== 'done') seen.note = pr.note;
      return seen;
    });
  }

  const upNext: RoadmapPr[] = [];
  for (const entry of parseBuildOrder(plan)) {
    const known = byBranch.get(entry.branch);
    if (known?.status === 'done') continue;
    const pr: RoadmapPr = known ?? {
      branch: entry.branch,
      title: entry.title || entry.branch,
      what: '',
      status: entry.pr ? 'open' : 'planned',
      note: '',
      prs: entry.pr ? [entry.pr] : [],
      initiatives: [],
    };
    if (pr.rank !== undefined) continue; // listed twice: the first place counts
    pr.rank = upNext.length + 1;
    upNext.push(pr);
  }
  for (const pr of byBranch.values()) if (pr.status !== 'done' && pr.rank === undefined) upNext.push(pr);

  const nextUp = (i: Initiative) => {
    const left = i.prs.filter((pr) => pr.status !== 'done');
    if (!left.length) return Number.POSITIVE_INFINITY;
    return Math.min(...left.map((pr) => pr.rank ?? upNext.length + 1));
  };
  initiatives.sort((a, b) => nextUp(a) - nextUp(b));

  const done = [...byBranch.values()]
    .filter((pr) => pr.status === 'done')
    .sort((a, b) => Math.max(0, ...b.prs) - Math.max(0, ...a.prs));

  return { upNext, initiatives, done, later: parseLater(plan), phases: parsePhases(plan) };
}

function slugOf(path: string): string {
  return (path.split('/').pop() ?? path).replace(/\.md$/, '');
}

function parseInitiative(slug: string, text: string): Initiative {
  const name = (text.match(/^# (?:Initiative: )?(.+)$/m)?.[1] ?? slug).trim();
  const field = (label: string) => {
    const row = text.match(new RegExp(`^\\| \\*\\*${label}\\*\\* \\|(.*)\\|\\s*$`, 'm'));
    return row?.[1]?.trim() ?? '';
  };
  const prs: RoadmapPr[] = [];
  for (const table of tables(section(text, /^## The PRs/m))) {
    const col = (name: RegExp) => table.header.findIndex((h) => name.test(h));
    const [status, branch, title, what] = [col(/^Status$/), col(/^Branch$/), col(/^PR title$/), col(/^What it/)];
    if (branch < 0 || title < 0) continue;
    for (const row of table.rows) {
      const b = row[branch]?.match(BRANCH)?.[1];
      if (!b) continue;
      const pr = prFromStatus(row[status] ?? '');
      if (!pr) continue;
      prs.push({ ...pr, branch: b, title: row[title] ?? b, what: row[what] ?? '', initiatives: [slug] });
    }
  }
  return { slug, name, phase: field('Phase'), goal: field('Done when'), prs };
}

/** Reads a PR table's status cell. Undefined for a PR that moved to another initiative (that one lists it). */
function prFromStatus(cell: string): Pick<RoadmapPr, 'status' | 'note' | 'prs'> | undefined {
  const prs = [...cell.matchAll(/#(\d+)/g)].map((m) => Number(m[1]));
  const plain = cell.replace(/\*\*/g, '').trim();
  if (/^\*\*Done\*\*/.test(cell)) return { status: 'done', note: '', prs };
  if (/^Moved\b/i.test(plain)) return undefined;
  if (/^Waiting\b/i.test(plain)) return { status: 'waiting', note: plain, prs: [] };
  if (/^Next\b/i.test(plain)) return { status: 'next', note: plain === 'Next' ? '' : plain, prs: [] };
  return { status: 'planned', note: plain, prs: [] };
}

interface BuildOrderEntry {
  branch: string;
  pr?: number;
  title: string;
}

/** The plan's "Build order": `1. \`branch\`` lines, with ` (#31): Title` for a branch that isn't in an initiative. */
function parseBuildOrder(plan: string): BuildOrderEntry[] {
  const out: BuildOrderEntry[] = [];
  for (const line of section(plan, /^### Build order/m).split('\n')) {
    const m = line.match(/^\d+\.\s+`([^`]+)`\s*(?:\(#(\d+)\))?\s*(?::\s*(.*))?$/);
    if (m?.[1]) out.push({ branch: m[1], pr: m[2] ? Number(m[2]) : undefined, title: (m[3] ?? '').trim() });
  }
  return out;
}

/** The plan's "Not split into PRs yet": `- **Title:** text` bullets. */
function parseLater(plan: string): LaterItem[] {
  const out: LaterItem[] = [];
  for (const line of section(plan, /^### Not split into PRs yet/m).split('\n')) {
    const m = line.match(/^- \*\*(.+?):?\*\*:?\s*(.*)$/);
    if (m?.[1]) out.push({ title: m[1].replace(/:$/, ''), text: (m[2] ?? '').trim() });
  }
  return out;
}

/**
 * The phases: one for each phase heading in the plan (`### P4: Meta Quest VR (L)`), and how far along each is from
 * the "Where we are" table (`| P4 Quest VR | **Started** | ... |`, where one row can cover several: `| P6, P7 |`).
 * A phase with a row of its own takes its shorter name from there.
 */
function parsePhases(plan: string): Phase[] {
  const status = new Map<string, Phase['status']>();
  const tableNames = new Map<string, string>();
  for (const table of tables(section(plan, /^### Where we are/m))) {
    for (const row of table.rows) {
      const ids = row[0]?.match(/P\d+/g) ?? [];
      const s = (row[1] ?? '').replace(/\*\*/g, '').toLowerCase();
      const st = s.startsWith('done') ? 'done' : s.startsWith('not') || !s ? 'not-started' : 'started';
      for (const id of ids) status.set(id, st);
      const name = ids.length === 1 ? row[0]?.replace(/^P\d+\s*/, '').trim() : '';
      if (ids[0] && name) tableNames.set(ids[0], name);
    }
  }
  const out: Phase[] = [];
  const seen = new Set<string>();
  for (const m of plan.matchAll(/^### (P\d+): (.+?)(?: \([SML]\))?(?::.*)?$/gm)) {
    const id = m[1] ?? '';
    if (seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: tableNames.get(id) ?? (m[2] ?? '').trim(), status: status.get(id) ?? 'not-started' });
  }
  // A phase in the table with no heading of its own still shows.
  for (const [id, st] of status) if (!seen.has(id)) out.push({ id, name: tableNames.get(id) ?? id, status: st });
  return out.sort((a, b) => Number(a.id.slice(1)) - Number(b.id.slice(1)));
}

/** The text under a heading, up to the next heading of the same or a higher level. Empty if it isn't there. */
function section(text: string, heading: RegExp): string {
  const start = text.search(heading);
  if (start < 0) return '';
  const level = text.slice(start).match(/^#+/)?.[0].length ?? 2;
  const rest = text.slice(start).split('\n').slice(1);
  const end = rest.findIndex((line) => {
    const h = line.match(/^(#+) /);
    return !!h?.[1] && h[1].length <= level;
  });
  return (end < 0 ? rest : rest.slice(0, end)).join('\n');
}

interface Table {
  header: string[];
  rows: string[][];
}

/** The markdown tables in a block of text. */
function tables(text: string): Table[] {
  const out: Table[] = [];
  let current: Table | undefined;
  for (const line of text.split('\n')) {
    if (!line.startsWith('|')) {
      current = undefined;
      continue;
    }
    const cells = line
      .replace(/^\|/, '')
      .replace(/\|\s*$/, '')
      .split('|')
      .map((c) => c.trim());
    if (!current) {
      current = { header: cells, rows: [] };
      out.push(current);
    } else if (!cells.every((c) => /^:?-+:?$/.test(c))) current.rows.push(cells);
  }
  return out;
}

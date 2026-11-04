// The Roadmap page (roadmap.html): what we've built and what we're building next, in the order we plan to build it.
// The game opens it in a frame from the hut in the park (app/roadmap-hut.ts); it also works on its own.
import '@fontsource/chakra-petch/500.css';
import '@fontsource/chakra-petch/700.css';
import '@fontsource/ibm-plex-mono/400.css';
import '@fontsource/ibm-plex-mono/500.css';
import './roadmap.css';

import { ROADMAP_DOCS } from './docs';
import { type Initiative, type PrStatus, parseRoadmap, type Roadmap, type RoadmapPr } from './parse';

const REPO = 'https://github.com/costLAB/saber-side';

const STATUS: Record<PrStatus, string> = {
  done: 'Done',
  open: 'Being checked',
  next: 'Next up',
  planned: 'Planned',
  waiting: 'Waiting',
};

const esc = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

/** Light markdown to HTML: `code`, **bold**, and [links](...) shown as plain text. Escapes everything else. */
function inline(md: string): string {
  return esc(md)
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
}

const prLinks = (prs: number[]) =>
  prs.map((n) => `<a href="${REPO}/pull/${n}" target="_blank" rel="noopener">#${n}</a>`).join(' ');

function render(r: Roadmap): string {
  const names = new Map(r.initiatives.map((i) => [i.slug, shortName(i)]));
  const total = r.done.length + r.upNext.length;
  const pct = total ? Math.round((r.done.length / total) * 100) : 0;

  const header = `
    <header class="top">
      <p class="eyebrow">Ring Seven · Planning hut</p>
      <h1>Roadmap</h1>
      <p class="lede">Everything we've built for Saber Side, and everything we're going to build, in the order we plan
        to build it.</p>
      <div class="score" aria-label="${r.done.length} done, ${r.upNext.length} to go">
        <div class="bar"><span style="width:${pct}%"></span></div>
        <p><strong>${r.done.length}</strong> done · <strong>${r.upNext.length}</strong> to go</p>
      </div>
      <nav class="jump">
        <a href="#next">Up next</a><a href="#initiatives">Initiatives</a><a href="#later">Someday</a><a href="#done">Done</a>
      </nav>
    </header>`;

  const phases = `
    <section aria-labelledby="phases-h">
      <h2 id="phases-h">The big phases</h2>
      <ol class="phases">
        ${r.phases
          .map(
            (
              p,
            ) => `<li class="phase ${p.status}"><span class="pid">${esc(p.id)}</span><span class="pname">${esc(p.name)}</span>
              <span class="pstatus">${p.status === 'done' ? 'Done' : p.status === 'started' ? 'Started' : 'Not yet'}</span></li>`,
          )
          .join('')}
      </ol>
    </section>`;

  const upNext = `
    <section id="next" aria-labelledby="next-h">
      <h2 id="next-h">Up next, in order</h2>
      <p class="hint">Number 1 is what we build next. Each one is a single change to the game, called a pull request.</p>
      <ol class="ranked">${r.upNext.map((pr) => rankedItem(pr, names)).join('')}</ol>
    </section>`;

  const initiatives = `
    <section id="initiatives" aria-labelledby="init-h">
      <h2 id="init-h">Initiatives</h2>
      <p class="hint">An initiative is a big feature built a piece at a time. Here's each one and its pieces.</p>
      <div class="cards">${r.initiatives.map(initiativeCard).join('')}</div>
    </section>`;

  const later = `
    <section id="later" aria-labelledby="later-h">
      <h2 id="later-h">Someday</h2>
      <p class="hint">Bigger ideas we haven't split into pieces yet.</p>
      <ul class="later-list">${r.later.map((l) => `<li><strong>${inline(l.title)}</strong> ${inline(l.text)}</li>`).join('')}</ul>
    </section>`;

  const done = `
    <section id="done" aria-labelledby="done-h">
      <h2 id="done-h">Done so far</h2>
      <p class="hint">Newest first.</p>
      <ul class="done-list">${r.done
        .map(
          (pr) => `<li><span class="tick" aria-hidden="true">✓</span><span class="dtitle">${inline(pr.title)}</span>
            <span class="meta">${prLinks(pr.prs)} ${chips(pr, names)}</span></li>`,
        )
        .join('')}</ul>
    </section>`;

  const footer = `<footer><p>Built from the plan in <code>docs/REFACTOR_PLAN.md</code> and the initiative docs.</p></footer>`;
  return `<main>${header}${phases}${upNext}${initiatives}${later}${done}${footer}</main>`;
}

function rankedItem(pr: RoadmapPr, names: Map<string, string>): string {
  const note = pr.note && !/^Next$/.test(pr.note) ? `<span class="note">${inline(pr.note)}</span>` : '';
  const what = pr.what ? `<details><summary>What it adds</summary><p>${inline(pr.what)}</p></details>` : '';
  return `<li class="item ${pr.status}" data-branch="${esc(pr.branch)}">
      <span class="rank">${pr.rank ?? '–'}</span>
      <div class="body">
        <h3>${inline(pr.title)}</h3>
        <p class="meta"><span class="badge ${pr.status}">${STATUS[pr.status]}${pr.status === 'open' ? ` ${prLinks(pr.prs)}` : ''}</span>
          ${chips(pr, names)}<code class="branch">${esc(pr.branch)}</code></p>
        ${note}${what}
      </div>
    </li>`;
}

function initiativeCard(i: Initiative): string {
  const done = i.prs.filter((pr) => pr.status === 'done').length;
  const state = done === i.prs.length ? 'done' : done ? 'started' : 'planned';
  const label = state === 'done' ? 'Done' : state === 'started' ? 'In progress' : 'Planned';
  const pct = Math.round((done / i.prs.length) * 100);
  return `<article class="card ${state}" data-initiative="${esc(i.slug)}">
      <header>
        <h3>${inline(i.name)}</h3>
        <span class="badge ${state}">${label}</span>
      </header>
      <p class="goal"><span>The goal:</span> ${inline(i.goal)}</p>
      <div class="bar small"><span style="width:${pct}%"></span></div>
      <p class="count">${done} of ${i.prs.length} done${i.phase ? ` · ${inline(i.phase.replace(/\s*\(\[plan.*$/, ''))}` : ''}</p>
      <ol class="steps">${inBuildOrder(i.prs)
        .map(
          (pr) => `<li class="${pr.status}">
            <span class="mark">${pr.status === 'done' ? '✓' : (pr.rank ?? '–')}</span>
            <span class="stitle">${inline(pr.title)}</span>
            <span class="smeta">${pr.status === 'done' ? prLinks(pr.prs) : `<code>${esc(pr.branch)}</code>`}</span>
          </li>`,
        )
        .join('')}</ol>
    </article>`;
}

/** An initiative's PRs as they come: the done ones by PR number, then the rest by their place in the build order. */
function inBuildOrder(prs: RoadmapPr[]): RoadmapPr[] {
  const key = (pr: RoadmapPr) =>
    pr.status === 'done' ? Math.min(...pr.prs, 1e6) - 1e7 : (pr.rank ?? Number.POSITIVE_INFINITY);
  return [...prs].sort((a, b) => key(a) - key(b));
}

function chips(pr: RoadmapPr, names: Map<string, string>): string {
  return pr.initiatives.map((s) => `<span class="chip">${esc(names.get(s) ?? s)}</span>`).join('');
}

/** A short name for an initiative's chip: "Robot parts catalogs", not the whole sentence. */
function shortName(i: Initiative): string {
  const SHORT: Record<string, string> = {
    'carrot-economy': 'Carrot economy',
    'cyber-ore-mining': 'Ore mining',
    inventory: 'Inventory',
    'players-and-robots': 'Players and robots',
    'quest-vr': 'Quest VR',
    'robot-parts-catalog': 'Robot parts',
    'zero-g-swimming': 'Zero-g swimming',
  };
  return SHORT[i.slug] ?? i.name.split(':')[0] ?? i.name;
}

const root = document.getElementById('roadmap');
if (root) root.innerHTML = render(parseRoadmap(ROADMAP_DOCS));

// Inside the game's frame, Escape closes it (the game can't hear keys pressed in here).
if (window.parent !== window) {
  document.documentElement.classList.add('embedded');
  addEventListener('keydown', (e) => {
    if (e.key === 'Escape') window.parent.postMessage({ roadmap: 'close' }, location.origin);
  });
}

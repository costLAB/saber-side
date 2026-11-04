import type { DocFiles } from './parse';

/** The docs the Roadmap is built from, bundled as text at build time (and live in `pnpm dev`). */
export const ROADMAP_DOCS: DocFiles = import.meta.glob(
  ['../../../../docs/REFACTOR_PLAN.md', '../../../../docs/initiatives/*.md'],
  {
    query: '?raw',
    import: 'default',
    eager: true,
  },
);

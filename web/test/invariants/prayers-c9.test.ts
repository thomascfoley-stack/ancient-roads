// PR1a — C9: ONE-WAY RETRIEVAL, AND NO AI IN THE PRAYER CLOSET.
//
// Exit tests for block `PR1a`, written before the module exists (§0.1).
//
// These are the two properties that make the feature safe to ship at all, and both are the kind
// that decay silently: nothing breaks when a prayer starts being indexed, and nothing breaks when
// a transitive import pulls the AI client into the prayer module. A code-review convention catches
// neither. A failing test does.
//
// C9, from §0.5: the prayer is the QUERY, never the CORPUS. Retrieval reads FROM the library TO the
// user's content, never the reverse. Prayer text enters no embedding, no FTS index, no search
// corpus, no analytics payload, and no error-reporting payload — ever.
//
// "No AI anywhere in the prayer space" is not a preference. The product's position is that AI is
// not the Holy Spirit; a product that says so cannot put a model in the prayer closet. **The
// absence is the feature.**

import { readFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

/**
 * Source with comments stripped.
 *
 * The first version of the index check scanned raw source and failed on `prayers.ts` — whose own
 * header explains that it does NOT embed or index anything, using those very words. A test that
 * fires on a comment saying "we must not do X" is worse than useless: the obvious fix is to delete
 * the explanation, which loses the reasoning and keeps the risk.
 */
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

/**
 * Resolve the transitive import graph of a module within web/src.
 *
 * ASSERTED ON THE RESOLVED GRAPH, NOT ON A GREP FOR "openai". A direct import is the easy case and
 * nobody adds one by accident; the way this regresses is a helper that innocently pulls in
 * something that pulls in the embedder. Walking the graph catches that; a text search does not.
 */
function importGraph(entry: string, seen = new Set<string>()): Set<string> {
  const abs = path.join(SRC, entry);
  if (seen.has(entry) || !existsSync(abs)) return seen;
  seen.add(entry);
  const src = readFileSync(abs, 'utf8');
  for (const m of src.matchAll(/from\s+'(@\/[^']+|\.[^']+)'/g)) {
    const spec = m[1]!;
    const rel = spec.startsWith('@/') ? spec.slice(2) : path.normalize(path.join(path.dirname(entry), spec));
    for (const ext of ['.ts', '.tsx', '/index.ts', '/index.tsx']) {
      if (existsSync(path.join(SRC, rel + ext))) { importGraph(rel + ext, seen); break; }
    }
  }
  return seen;
}

const AI_MODULES = /lib\/(teacher|embed|retrieval)|deepinfra|verifier|embedder/i;

describe('PR1a / C9 — no AI reaches the prayer module', () => {
  // SEED: add `import { teach } from '@/lib/teacher/teach'` to prayers.ts -> RED.
  // SEED (the one that matters): add it to any module prayers.ts already imports -> also RED.
  it('the prayer module imports nothing from the AI client, transitively', () => {
    const graph = [...importGraph('lib/prayers.ts')];
    const ai = graph.filter((f) => AI_MODULES.test(f));
    expect(
      ai,
      'the prayer space must contain no model. A product that says AI is not the Holy Spirit ' +
        'cannot put one in the prayer closet — the absence is the feature.',
    ).toEqual([]);
  });

  it('the graph is non-trivial, so the check above is not vacuous', () => {
    // If prayers.ts stopped importing anything, the assertion above would pass while proving
    // nothing. It reaches the db layer at minimum.
    const graph = [...importGraph('lib/prayers.ts')];
    expect(graph.length, 'import graph collapsed — the AI assertion would be vacuous').toBeGreaterThan(1);
  });
});

describe('PR1a / C9 — prayer text enters no index', () => {
  it('the prayer write path issues no embedding call and touches no vector or FTS table', () => {
    // SEED: add an embed call to the create path -> RED.
    const src = code('lib/prayers.ts');
    expect(src, 'prayers must not be embedded').not.toMatch(/embed|vector|tsvector|to_tsquery|websearch_to_tsquery/i);
    expect(src, 'prayers must not be written into any corpus table').not.toMatch(/\b(embeddings|sections|section_embeddings|user_section_embeddings)\b/);
  });

  it('no retrieval or search module reads the prayers table', () => {
    // The other direction, and the one C9 is really about: the corpus must not learn to read the
    // reader's own words. Scans every search/retrieval surface for the table name.
    const surfaces = [
      'lib/search-sections.ts', 'lib/commentary-search.ts', 'lib/catalog.ts',
      'lib/teacher/retrieve.ts', 'lib/teacher/teach.ts', 'lib/user-corpus/search.ts',
    ].filter((f) => existsSync(path.join(SRC, f)));
    expect(surfaces.length, 'no retrieval surfaces found to check — the scan would be vacuous').toBeGreaterThan(2);
    const leaking = surfaces.filter((f) => /\bprayers\b/.test(code(f)));
    expect(leaking, 'a retrieval surface reads prayers — C9 forbids the user\'s words becoming corpus').toEqual([]);
  });

  it('prayers are absent from the annotations/notes surfaces', () => {
    // A prayer is a distinct entity, never notes-with-a-flag. If the notes layer knows about
    // prayers, the separation has already collapsed.
    expect(code('lib/annotations.ts'), 'the notes layer must not know about prayers').not.toMatch(/\bprayers?\b/i);
  });
});

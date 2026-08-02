// EVERY ACQUISITION KIND IN THE MANIFEST IS EITHER ARCHIVABLE OR EXPLICITLY NOT — 2026-08-02.
//
// The archive exists so the corpus stops being rebuildable only by re-scraping the internet
// (`data/raw` was measured at 21MB holding one SWORD module; everything else was gone). The way an
// archive fails is not by crashing — it is by quietly covering less than you think, and reporting
// success. So the coverage question is asked HERE, derived from the manifest, rather than trusted
// from a summary line.
//
// This file names no adapter kind except in its anti-vacuity floor. Add a seventh adapter to
// `ingest/sources.config.json` and the archiver must have a decided answer for it — a URL rule or
// a written reason — or this goes red.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { artifactSourcesFor, expandCcelIdPattern } from '../../src/ingest/source-artifact-urls.mjs';
import { forbiddenProvenanceDomain } from '../../src/ingest/forbidden-provenance.mjs';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Entry {
  slug?: string;
  license?: string;
  provenance?: { url?: string; acquire?: { adapter?: string } };
}

const ENTRIES = Object.values(
  JSON.parse(readFileSync(path.join(REPO, 'ingest/sources.config.json'), 'utf8')) as Record<string, Entry>,
).filter((e) => typeof e.slug === 'string');

/** Every acquire.adapter value the manifest actually uses, derived. `(none)` for entries without one. */
const KINDS = [...new Set(ENTRIES.map((e) => e.provenance?.acquire?.adapter ?? '(none)'))].sort();

describe('the manifest still looks like the manifest', () => {
  it('parsed a populated work list — an anti-vacuity floor', () => {
    // Every case below is "for each entry…", which passes trivially over an empty list.
    expect(ENTRIES.length).toBeGreaterThan(40);
    expect(KINDS).toContain('ccel');
    expect(KINDS).toContain('(none)');
    expect(KINDS.length).toBeGreaterThanOrEqual(2);
  });
});

describe('every acquisition kind has a decided answer', () => {
  // SEED: add `case 'newthing':` to the manifest without teaching source-artifact-urls.mjs about
  // it -> RED here, naming the kind, instead of it silently landing in the unrecoverable pile with
  // a generic "unknown adapter" and nobody noticing a whole work went unarchived.
  it.each(KINDS)('kind %s is either derivable or refused with a written reason', (kind) => {
    const sample = ENTRIES.find((e) => (e.provenance?.acquire?.adapter ?? '(none)') === kind)!;
    const res = artifactSourcesFor(sample);

    expect(res, `${kind}: artifactSourcesFor returned nothing`).toBeTruthy();
    if (res.ok) {
      expect(res.artifacts.length, `${kind}: derivable but produced zero artifacts`).toBeGreaterThan(0);
      for (const a of res.artifacts) {
        expect(a.urls.length, `${kind}/${a.name}: no URL`).toBeGreaterThan(0);
        for (const u of a.urls) expect(() => new URL(u), `${kind}: "${u}" is not a URL`).not.toThrow();
      }
    } else {
      // The reason must be a real explanation someone can act on, not a shrug. The generic
      // "unknown acquire adapter" string is exactly what must never be the answer for a kind the
      // manifest actually uses.
      expect(res.reason.length, `${kind}: empty reason`).toBeGreaterThan(30);
      expect(res.reason, `${kind}: fell through to the unknown-adapter default`).not.toMatch(/^unknown acquire adapter/);
    }
  });
});

describe('the CCEL id expansion is the adapter\'s, not a second copy', () => {
  it('expands a zero-padded brace range across its full span', () => {
    const ids = expandCcelIdPattern('spurgeon/sermons{01..63}');
    expect(ids.length).toBe(63);
    expect(ids[0]).toBe('spurgeon/sermons01'); // padding preserved, not "sermons1"
    expect(ids[62]).toBe('spurgeon/sermons63');
  });

  it('returns [] for a non-range, which callers read as "a single literal id"', () => {
    // Both the adapter and the archiver depend on this exact signal to agree on the id list.
    expect(expandCcelIdPattern('newton/olneyhymns')).toEqual([]);
    expect(expandCcelIdPattern(undefined)).toEqual([]);
  });

  it('adapter-ccel.ts CALLS the shared expander rather than inlining a regex', () => {
    // THE FIRST VERSION OF THIS CASE ONLY ASSERTED THE IMPORT, and its red-proof exposed that:
    // deleting the CALL while leaving the import line kept it green. An import is not a use, and
    // "the adapter references the shared module somewhere in its header" is not the property —
    // the property is that this expansion has exactly one implementation.
    // SEED: replace the `expandCcelIdPattern(...)` call with an inline regex -> RED.
    const src = readFileSync(path.join(REPO, 'src/ingest/adapter-ccel.ts'), 'utf8');
    expect(src, 'adapter-ccel.ts does not import expandCcelIdPattern').toMatch(
      /import\s*\{[^}]*expandCcelIdPattern[^}]*\}\s*from\s*'\.\/source-artifact-urls\.mjs'/,
    );
    expect(src, 'adapter-ccel.ts imports expandCcelIdPattern but never calls it').toMatch(/expandCcelIdPattern\(/);
    // And no second brace-range matcher anywhere in the file, however it is spelled.
    expect(src, 'adapter-ccel.ts still carries its own brace-range regex').not.toMatch(/\\d\+\\\.\\\./);
  });
});

describe('the legal gates bind at acquisition, not only downstream', () => {
  it('every forbidden-provenance work in the manifest is detected as such', () => {
    // The archiver refuses on this predicate. If the manifest ever stops carrying a forbidden
    // entry the assertion below would pass vacuously, so the count is asserted too.
    const forbidden = ENTRIES.filter((e) => forbiddenProvenanceDomain(String(e.provenance?.url ?? '')));
    expect(forbidden.length, 'no forbidden-provenance entry found — the predicate or the manifest changed').toBeGreaterThan(0);
    for (const e of forbidden) {
      expect(forbiddenProvenanceDomain(String(e.provenance?.url))).toBeTruthy();
    }
  });

  it('the archiver checks provenance BEFORE deriving any URL', () => {
    // Ordering is the property: deriving first and refusing second would still be correct, but a
    // future edit that logs or prefetches between the two would not be.
    const src = readFileSync(path.join(REPO, 'scripts/archive-sources.mts'), 'utf8');
    const gate = src.indexOf('forbiddenProvenanceDomain(');
    const derive = src.indexOf('artifactSourcesFor(entry)');
    expect(gate, 'archiver does not call forbiddenProvenanceDomain').toBeGreaterThan(-1);
    expect(derive, 'archiver does not call artifactSourcesFor').toBeGreaterThan(-1);
    expect(gate, 'the forbidden-provenance gate runs AFTER URL derivation').toBeLessThan(derive);
  });
});

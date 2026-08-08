// N1 — THE NAMING LOCK, ASSERTED AGAINST THE LABEL SURFACES.
//
// Exit test for block `N1` of docs/UX_REMEDIATION.md §2, written before the fix (§0.1).
//
// SCOPE, AND WHY IT IS NOT THE WHOLE TREE. §2.2 as originally written grepped everything and could
// never return zero: `lanes` is the wire field of `POST /api/ask/stream`, `kind: 'work'` is a
// desk-pane type tag, and both are exempt by §2.2's own amended table — renaming either is an API
// contract change, which §0.4 forbids inside a strings-only block. So this asserts the LABEL
// surfaces the lock actually governs, and asserts the exempt identifiers are STILL THERE, so a
// future over-eager rename fails rather than silently breaking the contract.
//
// `N1`'s fourth exit check is HUMAN ("someone who has never used the product reads the sidebar").
// An agent may never mark it (§0.3) and this file does not pretend to.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const read = (rel: string) => readFileSync(path.join(SRC, rel), 'utf8');

// The rendered-label files the lock governs. Deliberately a short, explicit list: these are the
// surfaces §2 names, and a sweep that changed anything else would be outside the block.
const LABEL_FILES = [
  'components/sidebar.tsx',
  'components/mobile-nav.tsx',
  'app/library/page.tsx',
  'app/library/notes/page.tsx',
  'app/library/uploads/page.tsx',
  'app/library/passages/page.tsx',
  'components/ask-client.tsx',
];

describe('N1 — retired names are gone from the label surfaces', () => {
  // SEED: restore any old label -> RED naming the file.
  const RETIRED: Array<[string, RegExp]> = [
    ['The corpus', /The corpus/],
    ['My library', /My library/],
    ['My Works', /My Works/],
  ];

  for (const [name, re] of RETIRED) {
    it(`"${name}" appears in no label surface`, () => {
      const hits = LABEL_FILES.filter((f) => {
        // Strip comments: this repo's comments quote the old names on purpose, to record what
        // changed. A lock that forbade discussing the old name would be absurd.
        const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
        return re.test(code);
      });
      expect(hits, `${name} still rendered in: ${hits.join(', ')}`).toEqual([]);
    });
  }

  it('the mobile tab says Ask, not AP', () => {
    const code = read('components/mobile-nav.tsx').replace(/\/\/.*$/gm, '');
    expect(code).not.toMatch(/label: 'AP'/);
    expect(code).toMatch(/label: 'Ask'/);
  });

  it('the Ask scope picker counts collections, not lanes', () => {
    const code = read('components/ask-client.tsx').replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
    // The rendered string only. `lanes` as a field name is exempt and asserted below.
    expect(code).not.toMatch(/of \$\{[^}]*\} lanes/);
    expect(code).toMatch(/collections/);
  });

  it('the counted noun is items, not works', () => {
    const hits: string[] = [];
    for (const f of ['app/library/page.tsx', 'app/library/[catalog]/page.tsx']) {
      const code = read(f).replace(/\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
      // The COUNTED noun only. An earlier version matched `'work'` outright and flagged
      // `kind: 'work'` — the desk-pane type tag this same file asserts must SURVIVE. A lock that
      // contradicts its own exemption is worse than no lock.
      // `[\s\S]*?` not `[^)]*`: the argument itself contains parens (`count(worksIn(id), 'work')`),
      // so a class excluding `)` stops at the inner one and matches nothing. That version passed
      // the seed — reverting the fix left it green — which is the definition of a check that
      // cannot fail. Caught only because the seed was actually run.
      if (/count\([\s\S]*?,\s*'work'\s*\)|work\$\{[^}]*\?\s*''\s*:\s*'s'\}/.test(code)) hits.push(f);
    }
    expect(hits, `still counting "works" in: ${hits.join(', ')}`).toEqual([]);
  });
});

// `New section` is in §2's table but its removal belongs to N4 ("Hide until sections exist"), not
// to a strings-only sweep — N1 must not delete a control. Asserting its absence here was my scope
// error, and moving the assertion is the correction; N4's exit test owns it.

describe('N1 — the exempt identifiers survive', () => {
  // The other half of the lock, and the more important one: §2.2 exempts wire fields and type tags
  // BY NAME. If a rename sweep takes them too, it breaks an API contract silently. These assertions
  // fail on over-reach, which no grep for absence can do.
  it('`lanes` remains the wire field of POST /api/ask/stream', () => {
    expect(read('app/api/ask/stream/route.ts')).toMatch(/lanes/);
  });

  it("`kind: 'work'` remains the desk-pane type tag", () => {
    expect(read('lib/desk.ts')).toMatch(/'work'/);
  });

  it('no route or href changed', () => {
    // §N1's third exit check. The routes the lock explicitly leaves alone.
    const sidebar = read('components/sidebar.tsx');
    for (const href of ['/library/notes', '/library/uploads', '/library/word-study', '/library/passages']) {
      expect(sidebar, `${href} must survive — renaming the label must not move the route`).toMatch(href);
    }
  });
});

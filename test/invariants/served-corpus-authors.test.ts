// THE DEPLOY GATE'S AUTHOR LIST IS THE SHIPPED ONE, AND THE SCAN CAN ACTUALLY FAIL.
//
// Two things are pinned here, and they fail for different reasons.
//
// 1. `scripts/lib/served-corpus-authors.mjs` carries a COPY of MUST_NOT_SERVE_AUTHORS, because it
//    runs under plain node in the deploy gate and cannot import a `.ts` module from `web/src`. A
//    hand-maintained copy is this repo's most-repeated defect, so it is not trusted: the copy must
//    be identical to the shipped list, and this goes red the moment either side gains or loses a
//    name. Without it, adding an author to the editorial ruling would silently leave the deploy
//    gate blind to it.
//
// 2. The scan must be able to FIND something. A scanner that returns an empty list because it
//    walked the wrong directory, or parsed nothing, reports "clean" indistinguishably from a clean
//    corpus — the vacuity failure this repo names explicitly. Driven against a fixture.

import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { IN_COPYRIGHT_SUSPECTS, MUST_NOT_SERVE, isMustNotServe, scanServedCorpusAuthors } from '../../scripts/lib/served-corpus-authors.mjs';
import { isMustNotServeAuthor } from '../../web/src/lib/legal-corpus';
import { MUST_NOT_SERVE_AUTHORS } from '../../web/src/lib/legal-corpus';

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fixture(entries: Array<{ author: string; text?: string }>): string {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'served-authors-'));
  tmps.push(dir);
  mkdirSync(path.join(dir, 'gen'), { recursive: true });
  writeFileSync(
    path.join(dir, 'gen', '1.json'),
    JSON.stringify({ book: 'gen', chapter: 1, entries: entries.map((e) => ({ ...e, text: e.text ?? 'x'.repeat(50) })) }),
  );
  return dir;
}

describe('the gate list mirrors the shipped list', () => {
  it('is byte-identical to MUST_NOT_SERVE_AUTHORS', () => {
    // SEED: add or remove a name on either side -> RED.
    expect([...MUST_NOT_SERVE].sort()).toEqual([...MUST_NOT_SERVE_AUTHORS].sort());
  });

  // THIS TEST'S TITLE WAS TRUE OF ITS INTENT AND FALSE OF ITS BODY, and that gap shipped a real
  // hole on 2026-08-18. It claimed the gate copy "normalises the same way the shipped predicate
  // does" while never once referencing the shipped predicate — it asserted hand-picked booleans
  // against the copy alone, so it stayed green when the shipped guard gained a name-prefix rule and
  // this copy did not. Measured cost of that green: `CS Lewis  (via the character Screwtape, a
  // devil)` (70 entries) and `Pseudo-Origen  (as quoted by Aquinas, AD 1274)` (12) were blocked by
  // the app and INVISIBLE to `predeploy-gate.ts` — the only thing standing between
  // `web/public/commentaries/` and delivery as unauthenticated static JSON.
  //
  // It now compares the two FUNCTIONS, over the author shapes the corpus is measured to contain
  // (including the double-space forms, which are what defeated the old rules), plus the two strings
  // that merely MENTION a vetoed name and must not be caught.
  it('normalises the same way the shipped predicate does — compared function to function', () => {
    const shapes = [
      'CS Lewis  (via the character Screwtape, a devil)',
      'Pseudo-Origen  (as quoted by Aquinas, AD 1274)',
      'Origen of Alexandria  (as quoted by Aquinas, AD 1274)',
      'Theophylact of Ohrid  (as quoted by Aquinas, AD 1274)',
      'Origen of Alexandria  is referenced above by Jerome (AD 420)',
      "Jerome's translation of Origen",
      'Origen of Alexandria', 'Theophylact of Ohrid', 'Tyndale Study Notes',
      'CS Lewis', 'GK Chesterton', 'JRR Tolkien', 'Douglas Wilson',
      'John Gill', 'Matthew Henry', 'Augustine of Hippo', 'John Chrysostom',
      'Origenes Adamantius the Younger',
      'Ignatius of Antioch  (as quoted by Origen, AD 235)',
      'Heracleon  (as quoted by Origen, AD 253)',
    ];
    const disagree = shapes.filter((a) => isMustNotServe(a) !== isMustNotServeAuthor(a));
    expect(
      disagree,
      'the deploy gate and the shipped predicate disagree on these author strings — the gate is what '
        + 'stands between web/public/commentaries and unauthenticated delivery, so a gap here ships '
        + 'the material while the gate prints green',
    ).toEqual([]);

    // Absolute anchors too, so a parity test cannot pass by both sides being wrong together.
    expect(isMustNotServe('Origen of Alexandria')).toBe(true);
    expect(isMustNotServe('CS Lewis  (via the character Screwtape, a devil)')).toBe(true);
    expect(isMustNotServe('John Gill')).toBe(false);
    expect(isMustNotServe('Origenes Adamantius the Younger')).toBe(false);
    expect(isMustNotServe('Ignatius of Antioch  (as quoted by Origen, AD 235)')).toBe(false);
  });
});

describe('the scan can fail, and says what it found', () => {
  it('finds a must-not-serve author in a served file', () => {
    // SEED: point the scanner at a directory that does not exist -> offenders empty -> RED.
    const r = scanServedCorpusAuthors(fixture([{ author: 'John Gill' }, { author: 'Tyndale Study Notes' }]));
    expect(r.entries).toBe(2);
    expect(r.offenders.map((o) => o.author)).toEqual(['Tyndale Study Notes']);
    expect(r.offenders[0]!.kind).toBe('must-not-serve');
  });

  // WAS: `expect(...).toMatchObject({ author: 'CS Lewis', kind: 'in-copyright' })`.
  //
  // The owner ruling of 2026-08-18 put CS Lewis on MUST_NOT_SERVE, and `scanServedCorpusAuthors`
  // tests `isMustNotServe` FIRST (`kind: must ? 'must-not-serve' : 'in-copyright'`), so he is now
  // caught by the explicit list and never reaches the heuristic. The safety property is unchanged —
  // he is still an offender, by a STRONGER route — so the assertion follows the code rather than
  // the code being bent back to the assertion.
  it('still catches CS Lewis — now by name rather than by heuristic', () => {
    const r = scanServedCorpusAuthors(fixture([{ author: 'CS Lewis' }]));
    expect(r.offenders[0]).toMatchObject({ author: 'CS Lewis', kind: 'must-not-serve', entries: 1 });
  });

  // AND THE CONSEQUENCE, PINNED AS A FACT RATHER THAN LEFT AS A COMMENT.
  //
  // `IN_COPYRIGHT_SUSPECTS` is exactly ['CS Lewis','GK Chesterton','JRR Tolkien','Douglas Wilson'] —
  // the four the ruling just added to MUST_NOT_SERVE. Every member is now shadowed, so the
  // `in-copyright` branch of the scanner is UNREACHABLE: no input can produce that kind. It is a
  // check that can no longer fail, created by a correct ruling rather than by a mistake.
  //
  // This is left standing rather than deleted because deleting it is a design call (bylaw 3 allows
  // deletion; AGENTS.md reserves content decisions to the owner) and because the branch regains its
  // purpose the moment an un-ruled 20th-century author is added to the suspects list — which is the
  // intended workflow: suspect first, ruling later. This test goes RED at exactly that moment,
  // which is when someone should notice the branch is live again.
  it('the in-copyright heuristic is currently fully shadowed by MUST_NOT_SERVE — an owner decision, not a bug', () => {
    const shadowed = IN_COPYRIGHT_SUSPECTS.filter((a) => isMustNotServe(a));
    expect(
      shadowed,
      'expected every in-copyright suspect to be shadowed by the explicit list. If this fails, a '
        + 'suspect is no longer must-not-serve: the heuristic branch is REACHABLE again and wants a '
        + 'real test of its own (see the case above, which used to be it).',
    ).toEqual([...IN_COPYRIGHT_SUSPECTS]);
  });

  it('reports a genuinely clean corpus as clean — the positive control', () => {
    // Without this every case above could pass by flagging everything.
    const r = scanServedCorpusAuthors(fixture([{ author: 'John Gill' }, { author: 'Matthew Henry' }]));
    expect(r.offenders).toEqual([]);
    expect(r.entries).toBe(2);
  });

  it('an UNPARSEABLE file is an offender, not a skip', () => {
    // "cannot read" must never read as "clean" — the vacuity failure in its most direct form.
    const dir = mkdtempSync(path.join(os.tmpdir(), 'served-authors-'));
    tmps.push(dir);
    mkdirSync(path.join(dir, 'gen'), { recursive: true });
    writeFileSync(path.join(dir, 'gen', '1.json'), '{ not json');
    expect(scanServedCorpusAuthors(dir).offenders.map((o) => o.author)).toContain('(unparseable file)');
  });

  it('an EMPTY directory reports zero files, so a caller can tell it scanned nothing', () => {
    const dir = mkdtempSync(path.join(os.tmpdir(), 'served-authors-'));
    tmps.push(dir);
    expect(scanServedCorpusAuthors(dir)).toMatchObject({ files: 0, entries: 0, offenders: [] });
  });
});

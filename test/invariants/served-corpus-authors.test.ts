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
import { MUST_NOT_SERVE, isMustNotServe, scanServedCorpusAuthors } from '../../scripts/lib/served-corpus-authors.mjs';
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

  it('normalises the same way the shipped predicate does', () => {
    // "Origen of Alexandria" ~ "Origen", and the Jerome's-translation bucket. Without this the
    // gate would miss the exact author strings the register ingest actually writes.
    expect(isMustNotServe('Origen of Alexandria')).toBe(true);
    expect(isMustNotServe('Theophylact of Ohrid')).toBe(true);
    expect(isMustNotServe("Jerome's translation of Origen")).toBe(true);
    // ...and does not over-match a legitimately published author.
    expect(isMustNotServe('John Gill')).toBe(false);
    expect(isMustNotServe('Origenes Adamantius the Younger')).toBe(false);
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

  it('finds a 20th-century author with no licence record', () => {
    const r = scanServedCorpusAuthors(fixture([{ author: 'CS Lewis' }]));
    expect(r.offenders[0]).toMatchObject({ author: 'CS Lewis', kind: 'in-copyright', entries: 1 });
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

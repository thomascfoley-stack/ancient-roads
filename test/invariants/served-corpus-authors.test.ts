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
import { IN_COPYRIGHT_SUSPECTS, MUST_NOT_SERVE, MUST_NOT_SERVE_SURNAMES, MUST_NOT_SERVE_WORK_EXCEPTIONS, ADR112_CUTOFF_YEAR, REVIEWED_SURNAME_CLEARANCES, isMustNotServe, isServingBanned, scanServedCorpusAuthors } from '../../scripts/lib/served-corpus-authors.mjs';
import { isMustNotServeAuthor } from '../../web/src/lib/legal-corpus';
import { MUST_NOT_SERVE_AUTHORS } from '../../web/src/lib/legal-corpus';
import {
  MUST_NOT_SERVE_SURNAMES as SHIPPED_SURNAMES,
  MUST_NOT_SERVE_WORK_EXCEPTIONS as SHIPPED_WORK_EXCEPTIONS,
  ADR112_CUTOFF_YEAR as SHIPPED_CUTOFF_YEAR,
  REVIEWED_SURNAME_CLEARANCES as SHIPPED_CLEARANCES,
} from '../../web/src/lib/must-not-serve-audit';

const tmps: string[] = [];
afterEach(() => {
  for (const d of tmps.splice(0)) rmSync(d, { recursive: true, force: true });
});

function fixture(entries: Array<{ author: string; work?: string; text?: string }>): string {
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

describe('the surname-token rule — the chesterton-preexistence hole, closed', () => {
  // THE HOLE, measured 2026-08-21: the static corpus carried 5 entries under
  // author 'Chesterton, Gilbert Keith' — surname-first, so the exact list, the of/the split, and
  // the name-prefix rule ALL missed them, and the deploy gate printed green over entries whose PD
  // basis was void (the text cites the NIV, 1978 — it is not Chesterton at all; owner close-out
  // 2026-08-21, ADR-112 follow-up). The veto knew the NAME; it could not see the SURNAME in any
  // format. This block pins the token rule that closes it, the three lists it depends on
  // (surnames, ruling admissions, reviewed clearances — mirrored between the gate copy and
  // web/src/lib/must-not-serve-audit.ts, identical by assertion, because a hand-maintained copy
  // drifting is the exact defect the first describe block was written against), and the two
  // recorded ways OUT of a surname hit.

  it('the gate surname list is identical to the shipped audit list', () => {
    // SEED: add a surname on either side only -> RED.
    expect([...MUST_NOT_SERVE_SURNAMES].sort()).toEqual([...SHIPPED_SURNAMES].sort());
  });

  it('the gate work-exceptions and cutoff are identical to the shipped ones', () => {
    // SEED: admit a work on one side only, or move the cutoff -> RED.
    expect(MUST_NOT_SERVE_WORK_EXCEPTIONS).toEqual(SHIPPED_WORK_EXCEPTIONS);
    expect(ADR112_CUTOFF_YEAR).toBe(SHIPPED_CUTOFF_YEAR);
  });

  it('the gate reviewed clearances are identical to the shipped ones', () => {
    // SEED: clear an author on one side only -> RED.
    expect(REVIEWED_SURNAME_CLEARANCES).toEqual(SHIPPED_CLEARANCES);
  });

  it('the exact string that slipped through is now an offender', () => {
    // This fixture IS the hole: before the rule, the scan returned zero offenders over it.
    const r = scanServedCorpusAuthors(fixture([{ author: 'Chesterton, Gilbert Keith', work: 'chesterton-preexistence' }]));
    expect(r.offenders).toHaveLength(1);
    expect(r.offenders[0]).toMatchObject({ author: 'Chesterton, Gilbert Keith', kind: 'must-not-serve', entries: 1 });
  });

  it('a ruling-admitted work of a vetoed surname is NOT an offender (ADR-112 keeps its 21)', () => {
    const r = scanServedCorpusAuthors(fixture([{ author: 'Chesterton, Gilbert Keith', work: 'chesterton-orthodoxy' }]));
    expect(r.offenders).toEqual([]);
  });

  it('an UNADMITTED work of a vetoed surname IS an offender (chesterton-aquinas, 1933 — ADR-112 cut)', () => {
    const r = scanServedCorpusAuthors(fixture([{ author: 'Chesterton, Gilbert Keith', work: 'chesterton-aquinas' }]));
    expect(r.offenders.map((o) => o.author)).toEqual(['Chesterton, Gilbert Keith']);
  });

  it('a reviewed surname clearance is NOT an offender (Bayly, Lewis — d.1631, not CS Lewis)', () => {
    // The only surname-token hit in the measured 1,212-file corpus. If this goes red because the
    // clearance was removed, the gate blocks every deploy on a public-domain bishop — which is
    // the correct fail-closed posture ONLY until a human re-reviews; the clearance is the record
    // that a human already did.
    const r = scanServedCorpusAuthors(fixture([{ author: 'Bayly, Lewis', work: 'bayly-piety' }]));
    expect(r.offenders).toEqual([]);
  });

  it('token boundaries hold — substrings are not surnames', () => {
    const r = scanServedCorpusAuthors(fixture([{ author: 'Lewisham' }, { author: 'Chestertonfield, John' }, { author: 'Wilsonian, Mark' }]));
    expect(r.offenders).toEqual([]);
  });
});

// ─────────────────────────────────────────────────────────────────────────────────────────────
// THE FLIP-TIME SERVING BAN — the embeddings-surface twin of the scan above.
//
// `publish-flip.mjs` is the ONLY gate that runs at flip time for the embeddings surface, and it
// used to call `isMustNotServe()` alone — which is forename-first / exact-match only. Embeddings
// store authors surname-first ("Chesterton, Gilbert Keith"; "Calvin, John" is a served voice in
// production, licensing.test.ts:184), so a vetoed author in 'Surname, Given' form PASSED the flip
// gate and became served until a later CI invariant caught it: the 2026-08-18 chesterton-preexistence
// incident, 25 served rows. `isServingBanned` mirrors the static surface's decision (must ||
// surnameHit) with the SAME two ways out, so the flip gate and the deploy gate agree in any format.
// Pure, so this runs in the same CI job as the scan parity tests rather than only against a DB.
describe('the flip-time serving ban — surname-first detected, ADR-112 admissions kept', () => {
  // THE INCIDENT, PINNED. If this ever goes false the flip gate is blind to surname-first again.
  it('bans a surname-first author the exact/prefix rules miss (the incident)', () => {
    // SEED: revert isServingBanned to `return isMustNotServe(author)` -> RED (all four go false).
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-preexistence')).toBe(true); // the incident
    expect(isServingBanned('Lewis, C.S.', 'lewis-screwtape')).toBe(true);
    expect(isServingBanned('Tolkien, J.R.R.', 'tolkien-lotr')).toBe(true);
    expect(isServingBanned('Wilson, Douglas', 'wilson-works')).toBe(true);
  });

  it('still bans forename-first, exact, and prefixed forms (no regression on the old path)', () => {
    // SEED: drop the `isMustNotServe(author)` short-circuit from isServingBanned -> RED on exact.
    expect(isServingBanned('GK Chesterton', 'chesterton-anything')).toBe(true);
    expect(isServingBanned('CS Lewis', 'lewis-anything')).toBe(true);
    expect(isServingBanned('CS Lewis  (via the character Screwtape, a devil)', 'lewis-screwtape')).toBe(true);
    expect(isServingBanned('Origen of Alexandria', 'origen-on-john')).toBe(true);
    expect(isServingBanned('Tyndale Study Notes', 'tyndale-notes')).toBe(true);
    expect(isServingBanned("Jerome's translation of X", 'jerome-something')).toBe(true);
  });

  it('admits a RULING-ADMITTED work of a vetoed surname (ADR-112 keeps its 21)', () => {
    // A regression here would BLOCK the admitted Chesterton works from ever being served via the
    // flip gate, while the static-JSON deploy gate admits them — the two surfaces disagreeing.
    // SEED: drop the `!isRulingAdmittedWorkSlug(work)` term from isServingBanned -> RED.
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-orthodoxy')).toBe(false);     // 1908
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-everlasting')).toBe(false);   // 1925
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-thursday')).toBe(false);      // 1908
  });

  it('refuses an UNADMITTED work of a vetoed surname (chesterton-aquinas, 1933 — ADR-112 cut)', () => {
    // SEED: make isRulingAdmittedWorkSlug return true unconditionally -> RED.
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-aquinas')).toBe(true);       // 1933, excluded
    expect(isServingBanned('Chesterton, Gilbert Keith', 'chesterton-preexistence')).toBe(true);   // undated, fail closed
  });

  it('admits a reviewed SURNAME clearance (Bayly, Lewis — d.1631, not CS Lewis)', () => {
    // The only surname-token hit in the measured static corpus; the same person can appear in the
    // embeddings surface. A regression here blocks a public-domain bishop from serving.
    // SEED: drop the `!(author in REVIEWED_SURNAME_CLEARANCES)` term from isServingBanned -> RED.
    expect(isServingBanned('Bayly, Lewis', 'bayly-piety')).toBe(false);
  });

  it('a non-string work FAILS CLOSED on the admission (no slug, no ruling to cite)', () => {
    // A row whose embeddings metadata lacks a work key cannot claim an ADR-112 admission — it must
    // fail closed (banned). SEED: add `if (work == null || work === '') return false;` (admit
    // un-keyed rows) to isServingBanned -> RED (all three go false).
    expect(isServingBanned('Chesterton, Gilbert Keith', null)).toBe(true);
    expect(isServingBanned('Chesterton, Gilbert Keith', '')).toBe(true);
    expect(isServingBanned('Chesterton, Gilbert Keith', undefined)).toBe(true);
  });

  it('does not fire on unrelated authors, in either format', () => {
    expect(isServingBanned('John Calvin', 'calvin-calcom01')).toBe(false);      // surname-first 'Calvin, John' is a served voice
    expect(isServingBanned('Calvin, John', 'calvin-calcom01')).toBe(false);
    expect(isServingBanned('Matthew Henry', 'matthew-henry')).toBe(false);
    expect(isServingBanned('Augustine of Hippo', 'augustine-confessions')).toBe(false);
    expect(isServingBanned('John Chrysostom', 'chrysostom-on-john')).toBe(false);
  });

  it('a null/empty author is NOT banned here — the flip gate owns that via its unattributed check', () => {
    // isServingBanned intentionally returns false for an unattributable author so the flip gate's
    // SEPARATE unattributed-author STOP owns that failure end-to-end (a row the ruling cannot be
    // checked against fails closed by a louder, distinct path). If this ever returns true the
    // unattributed STOP message goes stale and the two legs double-report.
    // SEED: add an `author == null` branch returning true to isServingBanned -> RED on the message.
    expect(isServingBanned(null, 'unknown')).toBe(false);
    expect(isServingBanned('', 'unknown')).toBe(false);
    expect(isServingBanned(undefined, 'unknown')).toBe(false);
  });
});

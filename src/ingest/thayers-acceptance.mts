// thayers-lexicon acceptance harness (corpus-backlog plan Phase 4) — NO database
// writes. Measures the adapter-thayers output against the acceptance bars and
// prints a quotable report for docs/evidence/profiles/thayers-<ts>.log:
//
//   npx tsx src/ingest/thayers-acceptance.mts [--dir=data/raw/github/thayers/book] [--jsonl=data/raw/github/thayers/thayers.jsonl]
//
//  1. Headword recognizability, re-running the A6 2026-07-17 method VERBATIM
//     (measureHeadwords + the pinned openscriptures Strong's Greek vocabulary,
//     both imported from adapter-archive.ts — one body of logic, not a re-type)
//     against the parsed headwords. A6 on archive.org OCR: 50.2% fuzzy /
//     6.2% strict, 0% Greek script. Here keys come from markup, not OCR.
//  2. Greek script presence, sampled entries printed so the Greek can be SEEN.
//  3. Strong's-number keying on known entries (G25 ἀγαπάω, G26 ἀγάπη,
//     G3056 λόγος, G2424 Ἰησοῦς, G846 αὐτός, G1 Α).
//  4. Negative control + RED-PROOFS (THE_LOOP rule 4 — a check never watched
//     go red proves nothing):
//       a. a fixture entry WITHOUT a Strong's line is counted in noStrong and
//          keyed thayer:* — not dropped, not mis-keyed;
//       b. a truncated book dir (2 entries) must TRIP the entry floor;
//       c. a fixture with a Latin-only headword set must TRIP the Greek bar.
//  5. Entry-count census vs the edition's declared size (5,521 entries,
//     G1–G5624 — README + measured heading count).
//
// Exits non-zero if any acceptance check fails.

import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { parseThayers, type ThayerParse } from './adapter-thayers.js';
import { loadStrongsGreek, measureHeadwords } from './adapter-archive.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const A6 = { fuzzy: 50.2, strict: 6.2, greek: 0 }; // archive.org OCR, measured 2026-07-17 across 3 scans
const RECOGNIZABILITY_BAR = 0.7; // the pre-registered A6 bar (adapter-archive THAYER.minRecognizable)

let failures = 0;
const check = (label: string, ok: boolean, detail: string) => {
  console.log(`  ${ok ? 'PASS' : 'FAIL'}  ${label} — ${detail}`);
  if (!ok) failures++;
};

function report(p: ThayerParse) {
  console.log(
    `parsed: ${p.records.length} entries | Strong-keyed ${p.strongKeyed} | no-strong ${p.noStrong.length} ` +
      `| stubs ${p.stubs.length} | repaired headwords ${p.repaired.length} | unrepaired junk ${p.junkHeadwords.length} ` +
      `| Greek headwords ${p.greekHeadwords} (${((p.greekHeadwords / p.records.length) * 100).toFixed(1)}%)`,
  );
}

async function main() {
  const dir = arg('--dir') ?? 'data/raw/github/thayers/book';
  const jsonl = arg('--jsonl') ?? 'data/raw/github/thayers/thayers.jsonl';

  console.log('== parse ==');
  const p = parseThayers(dir);
  report(p);

  // 5 (early print — the census basis). Edition declares 5,521 entries G1–G5624.
  console.log('\n== entry-count census (basis: edition README + measured `### ` heading count = 5,521) ==');
  check('entry count', p.records.length === 5521, `${p.records.length} vs 5,521 expected`);
  const jsonlCount = readFileSync(jsonl, 'utf8').trim().split('\n').length;
  check('jsonl row count matches parse', jsonlCount === p.records.length, `${jsonlCount} rows in ${jsonl}`);

  // 1. A6 method, re-run verbatim against the structured edition's headwords.
  console.log('\n== headword recognizability — A6 2026-07-17 method, re-run ==');
  const vocab = await loadStrongsGreek(path.join('data/raw/github/thayers', 'cache'));
  const hw = p.records.map((r) => ({ key: r.key.replace(/^(G\d+|thayer:\S+) /, ''), text: r.text }));
  const m = measureHeadwords(hw, vocab);
  console.log(
    `  structured edition: ${(m.rate * 100).toFixed(1)}% fuzzy / ${(m.exactRate * 100).toFixed(1)}% strict, ` +
      `${m.greekScript}/${m.total} headwords in Greek script (${((m.greekScript / m.total) * 100).toFixed(1)}%)`,
  );
  console.log(`  A6 archive.org OCR: ${A6.fuzzy}% fuzzy / ${A6.strict}% strict, ${A6.greek}% Greek script (3 scans, keys unrecoverable)`);
  for (const s of m.matchedSamples.slice(0, 5)) console.log(`    matched: ${s.key} ↔ ${s.lemma} (d=${s.distance})`);
  for (const s of m.unmatchedSamples.slice(0, 10)) console.log(`    unmatched: ${s}`);
  check('recognizability ≥ pre-registered 70% bar', m.rate >= RECOGNIZABILITY_BAR, `${(m.rate * 100).toFixed(1)}%`);
  check('Greek script present (OCR failure was 0%)', m.greekScript / m.total >= 0.95, `${((m.greekScript / m.total) * 100).toFixed(1)}%`);

  // 2. Greek, visibly.
  console.log('\n== sampled entries (Greek intact) ==');
  for (const g of ['G25', 'G3056', 'G26', 'G2424']) {
    const r = p.records.find((x) => x.key.startsWith(`${g} `))!;
    console.log(`  ${r.key}\n    ${r.text.slice(0, 180).replace(/\n/g, ' ¶ ')}`);
  }

  // 3. Strong's keying on known entries.
  console.log('\n== Strong\'s keying spot checks ==');
  const known: Record<string, string> = {
    G25: 'ἀγαπάω', G26: 'ἀγάπη', G3056: 'λόγος', G2424: 'Ἰησοῦς', G846: 'αὐτός', G1: 'Α',
  };
  for (const [g, expected] of Object.entries(known)) {
    const r = p.records.find((x) => x.key.startsWith(`${g} `));
    check(`${g} → ${expected}`, r !== undefined && r.key === `${g} ${expected}`, r?.key ?? '(missing)');
  }

  // 4. Negative control + red-proofs on full-size synthetic fixtures, so the REAL
  // parseThayers path (floor, Greek bar, keying, buckets) is what gets exercised.
  console.log('\n== negative control + red-proofs (synthetic fixtures through parseThayers) ==');
  const tmp = mkdtempSync(path.join(tmpdir(), 'thayers-accept-'));
  const synthEntry = (i: number) =>
    `### λόγος${i} — lógos${i}\n\`Strong's G${10_000 + i}\`\n\nλόγος${i}, a synthetic entry body long enough to be real.\n\n---\n\n`;

  // a. an entry WITHOUT a Strong's line is counted and keyed thayer:* — never
  //    dropped, never mis-keyed (the deliberate-handling control).
  const dirA = path.join(tmp, 'a');
  mkdirSync(dirA);
  writeFileSync(
    path.join(dirA, '01-fixture.md'),
    Array.from({ length: 5000 }, (_, i) => synthEntry(i)).join('') +
      '### orphanword\n\nAn entry whose Strong\'s line is absent entirely, kept deliberately long enough.\n',
  );
  const fa = parseThayers(dirA);
  check('no-Strong\'s entry counted, not dropped', fa.noStrong.length === 1 && fa.records.length === 5001,
    `noStrong=${fa.noStrong.length}, total=${fa.records.length}`);
  check('no-Strong\'s entry keyed thayer:* (not mis-keyed)', /^thayer:01-fixture\.md:5001 orphanword$/.test(fa.noStrong[0]?.key ?? ''),
    fa.noStrong[0]?.key ?? '(none)');

  // b. RED-PROOF: the entry floor trips on a truncated book dir.
  const dirB = path.join(tmp, 'b');
  mkdirSync(dirB);
  writeFileSync(path.join(dirB, '01-fixture.md'), synthEntry(1) + synthEntry(2));
  let floorThrew = false;
  try { parseThayers(dirB); } catch (e) { floorThrew = /only \d+ entries/.test(String(e)); }
  check('RED-PROOF: entry floor trips on a 2-entry dir', floorThrew, 'parseThayers threw the entry-floor error');

  // c. RED-PROOF: the Greek bar trips on Latin-only headwords (the OCR failure mode).
  const dirC = path.join(tmp, 'c');
  mkdirSync(dirC);
  writeFileSync(
    path.join(dirC, '01-fixture.md'),
    Array.from({ length: 5000 }, (_, i) =>
      `### logos${i} — logos${i}\n\`Strong's G${10_000 + i}\`\n\nlogos${i}, a synthetic Latin-headword entry body long enough.\n\n---\n\n`).join(''),
  );
  let greekThrew = false;
  try { parseThayers(dirC); } catch (e) { greekThrew = /Greek script/.test(String(e)); }
  check('RED-PROOF: Greek bar trips on 0%-Greek headwords (OCR mode)', greekThrew, 'parseThayers threw the Greek-bar error');

  console.log('\n' + (failures === 0 ? 'ALL ACCEPTANCE CHECKS PASS' : `${failures} CHECK(S) FAILED`));
  process.exit(failures === 0 ? 0 : 1);
}

main().catch((e) => { console.error(e); process.exit(1); });

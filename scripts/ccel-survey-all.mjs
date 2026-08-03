#!/usr/bin/env node
/**
 * SURVEY EVERY WORK IN THE CCEL INDEX — rights, structure, size — before any manifest entry exists.
 *
 *   node scripts/ccel-harvest-index.mjs            # first: the inventory
 *   node scripts/ccel-survey-all.mjs [--limit=N] [--out=docs/evidence/ccel-survey-all.json]
 *
 * WHY EVERY WORK IS ASKED INDIVIDUALLY. A 60-work stratified sample on 2026-08-02 found THREE with
 * live copyright claims — "Copyright by J.H. Boer", "Copyright claimed by Paul Halsall", "From
 * online edition Copyright 2003". CCEL hosting a text is NOT the same as the text being public
 * domain, and `CLAUDE.md` makes that distinction existential: a licensing violation is legally
 * irreversible. Extrapolated, ~70 of the catalogue's 1,383 works carry such a claim. They are
 * indistinguishable from the rest by title, author or id — only by asking.
 *
 * WHAT IT DECIDES, AND WHAT IT REFUSES TO DECIDE. It records the licence CCEL states, per work.
 * It does NOT choose a licence, and it never substitutes a convenient one: a work whose rights are
 * a copyright claim is written down as exactly that, so the manifest carries the truth and the
 * repo's own `isAllowedLicense` rail refuses it downstream. Laundering a licence to get a work past
 * a gate is the defect migration 031 exists to detect; this will not manufacture one.
 *
 * The owner's rule is PUBLISHED BEFORE 1930. CCEL's `DC.Date` is its own digitisation date (Calvin's
 * Institutes reads 2002-08-31) and `firstPublished` is present but empty, so publication year is
 * not readable. Two readable facts stand in for it, and the second is why this is not simply
 * "trust DC.Rights":
 *
 *   rightsDeclared  the work's own DC.Rights says public domain — the source's machine-readable
 *                   statement, the same class of fact the adapter already trusts scripRef for.
 *   authorPre1930   DC.Rights is EMPTY but the author died before 1930. Spurgeon's sermon volumes
 *                   come back empty and he died in 1892; even the posthumous "Volume 58: 1912" is
 *                   comfortably pre-1930. Empty means unstated, not disputed.
 *
 * Anything else — an explicit copyright claim, or empty rights with an author who died in 1930 or
 * later or whose dates CCEL does not state — is recorded as such. 119 of 413 authors have no
 * readable dates, and an unverifiable date is not a licence.
 *
 * RANGED FETCHES. Only the ThML head is needed, so each work is requested as bytes 0-24575. The
 * catalogue is 1,383 works and several are 10MB+; pulling them whole to read a header would move
 * gigabytes to learn kilobytes.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (f) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const inPath = arg('--in') ?? 'docs/evidence/ccel-index.json';
const outPath = arg('--out') ?? 'docs/evidence/ccel-survey-all.json';
const limit = Number(arg('--limit') ?? 0);
const CONCURRENCY = Number(arg('--concurrency') ?? 6);

const idx = JSON.parse(fs.readFileSync(inPath, 'utf8'));
let works = idx.authors.flatMap((a) =>
  a.works.map((w) => ({ id: w.id, title: w.title, author: a.name, authorId: a.id, authorDied: a.died })),
);
if (limit > 0) works = works.slice(0, limit);
console.log(`surveying ${works.length} work(s) at concurrency ${CONCURRENCY}\n`);

const PD = /public\s*domain/i;
const COPYRIGHT = /copyright|©|all rights reserved/i;

async function survey(w) {
  try {
    const r = await fetch(`https://www.ccel.org/ccel/${w.id}.xml`, {
      headers: { Range: 'bytes=0-24575' },
      signal: AbortSignal.timeout(30_000),
    });
    if (r.status !== 200 && r.status !== 206) return { ...w, verdict: 'missing', detail: `HTTP ${r.status}` };
    const b = await r.text();
    const rights = (/<DC\.Rights[^>]*>([^<]{0,120})/i.exec(b)?.[1] ?? '').replace(/\s+/g, ' ').trim();

    // THE EDITION YEAR, which license-manifest.ts requires on every entry (the edition-trap
    // guard: a public-domain WORK must not be claimed while a modern EDITION is served).
    //
    // DC.Date is CCEL's own digitisation date — Calvin's Institutes reads 2002-08-31 — and is
    // useless here. The real one is <printSourceInfo><published>, which ~40% of works carry.
    //
    // For the rest the AUTHOR'S DEATH YEAR is used, and recorded as such. That is a bound, not a
    // print date, and calling it anything else would be the fabrication this guard exists to
    // catch: an author cannot publish after dying, so it is a sound UPPER bound — which is
    // precisely the direction the published-before-1930 rule needs. yearBasis carries the
    // derivation so no reader mistakes one for the other.
    const head = b.slice(0, (b.indexOf('</ThML.head>') + 12) || b.length);
    const publishedEl = /<published[^>]*>([^<]{1,80})/i.exec(head)?.[1] ?? '';
    const printYear = /\b(1[0-9]{3})\b/.exec(publishedEl)?.[1];
    const year = printYear ? Number(printYear) : (w.authorDied ?? null);
    const yearBasis = printYear ? 'printSourceInfo' : (w.authorDied ? 'authorDeathUpperBound' : 'none');
    const divs = (b.match(/<div[123]\b/g) ?? []).length;
    const pageImages = (b.match(/<img alt="Image of page/g) ?? []).length;

    // Licence FIRST: a work we may not use is not made usable by being well-structured.
    let licence, licenceBasis;
    if (rights && PD.test(rights)) { licence = 'Public Domain'; licenceBasis = 'rightsDeclared'; }
    else if (rights && COPYRIGHT.test(rights)) { licence = rights.slice(0, 100); licenceBasis = 'copyrightClaimed'; }
    else if (!rights && w.authorDied !== null && w.authorDied < 1930) { licence = 'Public Domain'; licenceBasis = 'authorPre1930'; }
    else if (!rights) { licence = null; licenceBasis = w.authorDied === null ? 'noRightsNoDates' : `noRightsAuthorDied${w.authorDied}`; }
    else { licence = rights.slice(0, 100); licenceBasis = 'rightsOther'; }

    const usable = licence === 'Public Domain';
    // Structure only matters for a work we may actually use.
    const scans = pageImages > 15;
    const verdict = !usable ? 'licence-blocked' : year === null ? 'no-edition-year' : scans ? 'page-scans' : divs === 0 ? 'no-structure' : 'ingestable';
    return { ...w, verdict, licence, licenceBasis, year, yearBasis, rights: rights || null, divs, pageImages };
  } catch (e) {
    return { ...w, verdict: 'error', detail: String(e.message).slice(0, 60) };
  }
}

const results = [];
let done = 0;
const queue = [...works];
await Promise.all(
  Array.from({ length: CONCURRENCY }, async () => {
    for (;;) {
      const w = queue.shift();
      if (!w) return;
      results.push(await survey(w));
      if (++done % 100 === 0) console.log(`  ${done}/${works.length}`);
    }
  }),
);

const by = (k) => results.reduce((m, r) => ({ ...m, [r[k] ?? '(none)']: (m[r[k] ?? '(none)'] ?? 0) + 1 }), {});
const ingestable = results.filter((r) => r.verdict === 'ingestable');
fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({
  _: 'Per-work CCEL survey. Records the licence CCEL states — it does not choose one. A copyright claim is written down as a copyright claim.',
  rule: 'owner 2026-08-02: published before 1930. Implemented as rightsDeclared OR (rights empty AND author died before 1930).',
  totals: { surveyed: results.length, ingestable: ingestable.length },
  byVerdict: by('verdict'), byLicenceBasis: by('licenceBasis'),
  results,
}, null, 2)}\n`);

console.log(`\n=== ${results.length} surveyed`);
for (const [k, n] of Object.entries(by('verdict')).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
console.log('\nlicence basis:');
for (const [k, n] of Object.entries(by('licenceBasis')).sort((a, b) => b[1] - a[1])) console.log(`  ${String(n).padStart(5)}  ${k}`);
const claims = results.filter((r) => r.licenceBasis === 'copyrightClaimed');
console.log(`\nCOPYRIGHT CLAIMS FOUND: ${claims.length}`);
for (const c of claims.slice(0, 12)) console.log(`   ${c.id.padEnd(30)} ${String(c.rights).slice(0, 60)}`);
console.log(`\nwrote ${outPath}`);

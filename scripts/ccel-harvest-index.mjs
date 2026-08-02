#!/usr/bin/env node
/**
 * HARVEST CCEL'S AUTHOR INDEX — the whole catalogue in one request.
 *
 *   node scripts/ccel-harvest-index.mjs [--out=docs/evidence/ccel-index.json]
 *
 * https://www.ccel.org/index/author is 662KB of HTML that contains, for every author, the id, the
 * display name, the life dates, and EVERY work's id and title inlined. So the entire catalogue is
 * one fetch rather than 455 enumerations, and the life dates arrive with it.
 *
 * THE LIFE DATES ARE THE POINT, not a nicety. `CLAUDE.md` makes licensing existential: ingest only
 * public-domain or commercially-permissive content, and a violation is legally irreversible. A
 * manifest entry asserts `license` and `author_died`, and asserting those for 455 authors from
 * memory is exactly the kind of confident guess this repo keeps catching. CCEL states the dates;
 * this records what CCEL states, and flags every author whose dates it cannot read rather than
 * defaulting them to something convenient.
 *
 * It writes a JSON inventory and nothing else. No database, no manifest, no decision about what
 * belongs in the corpus — that judgement is downstream and human.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (f) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const outPath = arg('--out') ?? 'docs/evidence/ccel-index.json';

const html = await (await fetch('https://www.ccel.org/index/author', { signal: AbortSignal.timeout(120_000) })).text();
console.log(`fetched ${(html.length / 1024).toFixed(0)}KB`);

// Each author is an <h5 class="browse_author_name"> whose <a id="author_link_{id}"> text reads
// "Surname, Forename (birth-death) (N classics)".
const authors = new Map();
for (const m of html.matchAll(/<a id="author_link_([a-z0-9_]+)"[^>]*>([\s\S]{0,180}?)<\/a>/gi)) {
  const id = m[1];
  const text = m[2].replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  // "Calvin, John (1509-1564) (54 classics)" — dates may be absent, a single year, or use an
  // en dash / "c." / "?" for uncertainty. Anything not a clean 3-4 digit pair is left NULL.
  const dates = /\((\d{3,4})\s*[-–—]\s*(\d{3,4})\)/.exec(text);
  const name = text.replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim();
  authors.set(id, {
    id,
    name,
    born: dates ? Number(dates[1]) : null,
    died: dates ? Number(dates[2]) : null,
    datesRaw: /\(([^)]*\d{3,4}[^)]*)\)/.exec(text)?.[1] ?? null,
    works: [],
  });
}

// Works are inlined as <a href=".../ccel/{author}/{work}"> Title</a>.
//
// NOT anchored on `href="`, deliberately: CCEL emits a NEWLINE between the attribute name and the
// quoted URL —
//     <a href=
//                 "https://ccel.org/ccel/caius/fragments">
// — so a pattern requiring `href="` contiguously matches zero of 1,368 works and reports a
// catalogue of 454 authors owning nothing between them. Matching the path itself is both simpler
// and immune to however CCEL wraps its attributes next.
for (const m of html.matchAll(/\/ccel\/([a-z0-9_]+)\/([a-z0-9_.]+)"[^>]*>\s*([^<]{1,140})</gi)) {
  const [, author, work, rawTitle] = m;
  const a = authors.get(author);
  if (!a) continue;
  const title = rawTitle.replace(/\s+/g, ' ').trim();
  if (!title || work === 'index') continue;
  if (!a.works.some((w) => w.id === work)) a.works.push({ id: `${author}/${work}`, title });
}

const list = [...authors.values()].sort((a, b) => b.works.length - a.works.length);
const withWorks = list.filter((a) => a.works.length > 0);
const totalWorks = withWorks.reduce((n, a) => n + a.works.length, 0);
const undated = withWorks.filter((a) => a.died === null);

fs.mkdirSync(path.dirname(outPath), { recursive: true });
fs.writeFileSync(outPath, `${JSON.stringify({
  _: 'CCEL author index, harvested. An INVENTORY of what exists — not a decision that any of it belongs in the corpus.',
  source: 'https://www.ccel.org/index/author',
  totals: { authors: list.length, authorsWithWorks: withWorks.length, works: totalWorks, authorsMissingDates: undated.length },
  authors: withWorks,
}, null, 2)}\n`);

console.log(`\nauthors indexed        ${list.length}`);
console.log(`authors with works     ${withWorks.length}`);
console.log(`WORKS TOTAL            ${totalWorks}`);
console.log(`authors missing dates  ${undated.length}  (licence cannot be asserted for these without a source)`);
console.log('\nlargest catalogues:');
for (const a of withWorks.slice(0, 12)) {
  console.log(`  ${String(a.works.length).padStart(4)}  ${a.id.padEnd(22)} ${a.name.slice(0, 34).padEnd(35)} ${a.died ? `d.${a.died}` : 'DATES UNKNOWN'}`);
}
console.log(`\nwrote ${outPath}`);

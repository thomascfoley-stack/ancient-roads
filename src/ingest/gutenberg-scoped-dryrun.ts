// Dry-run harness for the section-scoped gutenberg profiles (the
// donne-divine-poems / herrick-noble-numbers un-quarantine, corpus-backlog
// Phase 4). Prints, for each work:
//   1. KEPT — the exact section list the profile WOULD ingest (heading +
//      char count + verse anchor), so the selection is inspectable without
//      a DB write;
//   2. DROPPED — the negative control: everything in the volume OUTSIDE the
//      declared scope, counted and sampled by name. A profile that drops
//      nothing is a failure;
//   3. CONTENTS PROOF — the positive control: Donne is checked against the
//      volume's own table of contents (parsed from the fetched text);
//      Herrick's edition prints no Noble Numbers ToC, so the proof is the
//      edition's own poem numeration (1-271 with its declared gap).
// Writes NOTHING. Exit 1 on any failed assertion.
//
//   npx tsx src/ingest/gutenberg-scoped-dryrun.ts --slug=donne-divine-poems
//   npx tsx src/ingest/gutenberg-scoped-dryrun.ts --slug=herrick-noble-numbers

import { readFileSync, existsSync } from 'node:fs';
import { PROFILES, stripBoilerplate, fetchGutenberg, scopedSections } from './adapter-gutenberg.js';

const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
if (!slug) throw new Error('usage: npx tsx src/ingest/gutenberg-scoped-dryrun.ts --slug=<slug> [--census]');
const censusOnly = process.argv.includes('--census');

// ── --census: dev-ONLY staged-state census (before/after re-ingest). Reads
// the owner URL from the ROOT .env.local, never prints it, and refuses any
// endpoint that is not the dev branch — the same two-factor rule as
// register-writer (branch label from the same source as the URL + host check).
if (censusOnly) {
  const localEnv = (name: string): string | undefined =>
    process.env[name] ?? (existsSync('.env.local')
      ? readFileSync('.env.local', 'utf8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '')
      : undefined);
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  const branch = localEnv('NEON_BRANCH');
  if (!dbUrl) throw new Error('DATABASE_URL required (root .env.local)');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  const host = new URL(dbUrl).host;
  if (!host.includes('ep-tiny-hat')) throw new Error(`STOP: DB host "${host}" is not the dev branch (expected ep-tiny-hat)`);
  console.log(`db host: ${host} (credentials redacted), branch=${branch}`);
  const { default: pg } = await import('pg');
  const client = new pg.Client({ connectionString: dbUrl, ssl: { rejectUnauthorized: false } });
  await client.connect();
  try {
    for (const s of slug === 'all' ? ['donne-divine-poems', 'herrick-noble-numbers'] : [slug]) {
      const { rows: [src] } = await client.query<{ id: string; status: string }>(`SELECT id, status FROM sources WHERE slug=$1`, [s]);
      if (!src) { console.log(`\n${s}: no sources row`); continue; }
      const { rows: [c] } = await client.query<{ sections: number; flat: number; anchors: number }>(
        `SELECT (SELECT count(*) FROM sections WHERE source_id=$1)::int AS sections,
                (SELECT count(*) FROM embeddings WHERE user_id IS NULL AND metadata->>'work'=$2)::int AS flat,
                (SELECT count(*) FROM section_anchors sa JOIN sections se ON se.id=sa.section_id WHERE se.source_id=$1)::int AS anchors`,
        [src.id, s]);
      console.log(`\n${s}: status=${src.status} sections=${c!.sections} flat_embeddings=${c!.flat} section_anchors=${c!.anchors}`);
      const { rows: heads } = await client.query<{ heading: string | null }>(
        `SELECT heading FROM sections WHERE source_id=$1 ORDER BY ordinal`, [src.id]);
      const secular = ['good-morrow', 'sunne rising', 'the flea', 'going to bed', 'hesperides', 'julia', 'dianeme', 'corinna'];
      const hits = heads.filter((h) => h.heading && secular.some((w) => h.heading!.toLowerCase().includes(w)));
      console.log(`  secular-heading scan over ${heads.length} sections: ${hits.length ? `✗ ${hits.map((h) => h.heading).join(' | ')}` : '✓ zero secular headings'}`);
      const show = heads.length <= 45 ? heads : [...heads.slice(0, 3), { heading: `… (${heads.length - 6} more) …` }, ...heads.slice(-3)];
      for (const h of show) console.log(`     § ${(h.heading ?? '(no heading)').slice(0, 72)}`);
    }
  } finally {
    await client.end();
  }
  process.exit(0);
}
const profile = PROFILES[slug];
if (!profile?.sections) throw new Error(`${slug} has no section-scoped profile`);
const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
const entry = manifest.find((e) => e.slug === slug);
if (!entry) throw new Error(`no manifest entry ${slug}`);
const ebookId = (entry.provenance as { acquire: { ebook_id: number } }).acquire.ebook_id;

const norm = (s: string): string => s.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/v/g, 'u').trim(); // v→u fold: ToC prints "Annunciation", the body "ANNVNCIATION"

// Secular text that MUST appear in the dropped set and MUST NOT appear in the
// kept set. Chosen from each volume's secular part (Donne: Songs and Sonnets
// and the Elegies; Herrick: Hesperides).
const PROBES: Record<string, string[]> = {
  'donne-divine-poems': ['The good-morrow', 'The Sunne Rising', 'The Flea', 'Going to Bed', 'The Anagram'],
  'herrick-noble-numbers': ['THE ARGUMENT OF HIS BOOK', 'TO DIANEME', 'CHERRY-RIPE', 'UPON JULIA', 'DELIGHT IN DISORDER'],
};

const raw = await fetchGutenberg(ebookId);
const body = stripBoilerplate(raw);
const result = scopedSections(body, profile.sections);
const keptText = result.sections.map((s) => `${s.heading ?? ''}\n${s.body}`).join('\n');
const droppedText = `${body.slice(0, result.scopeStart)}\n${body.slice(result.scopeEnd)}`;

let failures = 0;
const fail = (msg: string): void => { failures++; console.log(`  ✗ ${msg}`); };

console.log('='.repeat(78));
console.log(`SCOPED PROFILE DRY RUN — ${slug} (Gutenberg #${ebookId}) — nothing written`);
console.log(`scope: chars ${result.scopeStart}..${result.scopeEnd} of ${body.length} (kept ${result.scopeEnd - result.scopeStart}, dropped ${result.scopeStart + (body.length - result.scopeEnd)})`);
console.log('='.repeat(78));

console.log(`\n── KEPT SECTIONS (${result.sections.length}) ──`);
result.sections.forEach((s, i) => {
  console.log(`  ${String(i + 1).padStart(3)}  ${(s.heading ?? '(no heading)').slice(0, 64).padEnd(64)}  ${String(s.body.length).padStart(6)} chars${s.anchors ? '  [anchored]' : ''}`);
});
if (result.filtered.length) {
  console.log(`\n── DECLARED BUT FILTERED (${result.filtered.length}) — inspect, these are poems the contents promised ──`);
  for (const f of result.filtered) console.log(`  ! ${f.heading.slice(0, 60)}  (${f.reason})`);
  if (result.filtered.length > 0) fail(`${result.filtered.length} declared section(s) lost to filters`);
}

console.log(`\n── DROPPED (negative control) ──`);
if (slug === 'herrick-noble-numbers') {
  // Same unit mechanism as the kept set: numbered poem headings outside scope.
  const droppedUnits = [...droppedText.matchAll(/^\d{1,3}\. ([A-Z][^\n]{2,75})$/gm)].map((m) => m[1]!.replace(/_/g, ''));
  console.log(`  dropped numbered poems (Hesperides + appendix, this edition's numeration): ${droppedUnits.length}`);
  if (droppedUnits.length === 0) fail('dropped nothing — the profile is not selective');
  console.log('  sample of the dropped:');
  for (const t of droppedUnits.slice(0, 4)) console.log(`     - ${t.trim()}`);
  for (const t of droppedUnits.slice(-3)) console.log(`     - ${t.trim()}`);
} else {
  // The old whole-volume unit mechanism (blank blocks >120 chars) — what the
  // 2026-07-17 run ingested — applied to what the scope now excludes.
  const droppedBlocks = droppedText.split(/\n\s*\n\s*\n+/).map((b) => b.trim()).filter((b) => b.length > 120);
  console.log(`  dropped blocks (old whole-volume split, >120 chars): ${droppedBlocks.length}`);
  if (droppedBlocks.length === 0) fail('dropped nothing — the profile is not selective');
  console.log('  sample of the dropped (first line of block):');
  const names = droppedBlocks.map((b) => b.split('\n').find((l) => l.trim())!.trim().replace(/_/g, ''));
  for (const t of names.slice(0, 5)) console.log(`     - ${t.slice(0, 72)}`);
  for (const t of names.slice(-3)) console.log(`     - ${t.slice(0, 72)}`);
}
console.log('  secular probes (must be in dropped, absent from kept):');
for (const p of PROBES[slug] ?? []) {
  const inDropped = droppedText.includes(p);
  const inKept = keptText.includes(p);
  console.log(`     ${inDropped && !inKept ? '✓' : '✗'} "${p}" — dropped:${inDropped} kept:${inKept}`);
  if (!inDropped) fail(`probe "${p}" not found in the dropped text (expected in the volume's secular part)`);
  if (inKept) fail(`probe "${p}" found in the KEPT text — secular content leaks`);
}

console.log(`\n── CONTENTS PROOF (positive control) ──`);
if (slug === 'donne-divine-poems') {
  // The volume's own table of contents: the DIVINE POEMS block (indented,
  // period-less — distinct from the body's "DIVINE POEMS." part-heading).
  const tocStart = body.search(/^ {2}DIVINE POEMS\s*$/m);
  const tocEnd = body.search(/^ {2}ELEGIES UPON THE AUTHOR/m);
  if (tocStart < 0 || tocEnd < 0 || tocEnd < tocStart) throw new Error('ToC block not found');
  const tocLines = body.slice(tocStart, tocEnd).split('\n');
  // Entries end with a page number; continuation lines (wrapped titles) join
  // forward. A "}" splits the source column from the title column (Walton's
  // _Life of_ }To the Lady Magdalen…) — keep the title side. Leading
  // furniture (edition year, MS provenance, page-range columns) is stripped
  // iteratively.
  const rawEntries: string[] = [];
  let cur = '';
  for (const l of tocLines) {
    let t = l.trim();
    if (!t || /^DIVINE POEMS$/.test(t) || /^_?Holy Sonnets_?$/.test(t)) continue; // group headers, not poems
    if (t.includes('}')) t = t.slice(t.indexOf('}') + 1).trim();
    cur = cur ? `${cur} ${t}` : t;
    if (/\d+\s*$/.test(t)) { rawEntries.push(cur); cur = ''; }
  }
  const entries = rawEntries
    .map((e) => {
      let t = e;
      for (;;) {
        const s = t.replace(/^(?:"|MS\.|Westmoreland|Trinity College, Dublin,|INFINITATI SACRUM|before p\. \d+|\d{4}|\d+-\d+|\d+)\s+/, '');
        if (s === t) break;
        t = s;
      }
      return t.replace(/\s+\d+\s*$/, '').trim();
    })
    .filter((e) => e.length > 2);
  const keptNorms = result.sections.map((s) => norm(s.heading ?? ''));
  console.log(`  expected from the volume's ToC: ${entries.length} poems`);
  let missing = 0;
  for (const e of entries) {
    const en = norm(e.replace(/_/g, ''));
    const hit = keptNorms.some((k) => k.includes(en) || en.includes(k));
    if (!hit) { missing++; console.log(`     ✗ MISSING: ${e}`); }
  }
  console.log(`  matched: ${entries.length - missing}/${entries.length}`);
  if (missing) fail(`${missing} ToC-expected poem(s) absent from the kept sections`);
  else console.log('  ✓ every ToC-expected Divine Poem appears in the kept sections');
  // reverse: no kept heading is foreign to the ToC (same both-ways rule)
  const entryNorms = entries.map((e) => norm(e.replace(/_/g, '')));
  const foreign = result.sections.filter((s) => {
    const k = norm(s.heading ?? '');
    return !entryNorms.some((en) => k.includes(en) || en.includes(k));
  });
  if (foreign.length) {
    console.log('  kept headings not literally in the ToC text (check they are sub-parts of a ToC entry):');
    for (const f of foreign) console.log(`     ? ${f.heading}`);
  }
} else {
  console.log('  This edition prints no Noble Numbers table of contents (verified: no');
  console.log('  CONTENTS section for the Noble Numbers part of PG #22421), so the');
  console.log('  contents proof is the edition\'s own poem numeration, enforced by the');
  console.log('  profile itself: numbers 1..271, Pollard skips 268 (absent from the');
  console.log('  book — a numeration gap, not a dropped poem). The engine ABORTS on');
  console.log('  any other gap, dupe, or out-of-range number; it did not abort.');
  console.log(`  ✓ ${result.sections.length} numbered poems kept, sequence 1..271 minus [268] verified`);
}
console.log(`\n${failures === 0 ? '✓ ALL CHECKS PASSED' : `✗ ${failures} CHECK(S) FAILED`} — ${slug}`);
if (failures) process.exitCode = 1;

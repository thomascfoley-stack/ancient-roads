#!/usr/bin/env node
/**
 * TURN THE SURVEY INTO MANIFEST ENTRIES.
 *
 *   node scripts/ccel-generate-manifest.mjs [--write] [--limit=N]
 *
 * Reads docs/evidence/ccel-survey-all.json (which already established that each work EXISTS, is
 * TEXT rather than page scans, and may LAWFULLY be used) and emits `ingest/sources.config.json`
 * entries for the ingestable ones. Dry by default; `--write` commits them to the manifest.
 *
 * ── THE ONE JUDGEMENT THIS MAKES, AND HOW IT FAILS ───────────────────────────────────────────
 *
 * `source_type` decides WHICH LANE SERVES A WORK, and the registers are not equivalent:
 *
 *   commentary, father   feed the COMPOSED /ask pool via LEGAL_CORPUS_FILTER — they are woven
 *                        into answers and count toward the two-voices floor.
 *   sermon, theology,    ride LABELED lanes: retrieved and quoted, never composed over, never
 *   devotional, hymn,    able to satisfy the exegetical floor (the register wall, A5).
 *   poetry, historian
 *
 * So a misfiled work is not a cosmetic error. Filing a devotional as `commentary` puts daily
 * readings into the pool that answers "what does this verse mean", which is the register breach
 * the wall exists to prevent — and it would move the accuracy numbers without anyone asking for a
 * retrieval change.
 *
 * THEREFORE THE DEFAULT IS A LANE, NEVER THE POOL. A work whose type cannot be read off its own
 * title falls to `theology`, which is labeled and walled. That is deliberately the conservative
 * direction: the cost of a lane work that should have been exegesis is that it is quoted with a
 * label instead of woven in; the cost of the reverse is a breach. Ambiguous entries are listed at
 * the end so a human can promote them, and promoting is a decision someone makes rather than
 * something a regex did quietly.
 *
 * Titles are matched most-specific-first, because "Commentary on the Psalms" and "Sermons on the
 * Psalms" both contain a book name and only one of them is exegesis.
 */
import fs from 'node:fs';
import path from 'node:path';

const arg = (f) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const WRITE = process.argv.includes('--write');
const limit = Number(arg('--limit') ?? 0);

const survey = JSON.parse(fs.readFileSync('docs/evidence/ccel-survey-all.json', 'utf8'));
const manifest = JSON.parse(fs.readFileSync('ingest/sources.config.json', 'utf8'));
const existingSlugs = new Set(manifest.filter((e) => e?.slug).map((e) => e.slug));
const existingIds = new Set(
  manifest.flatMap((e) => {
    const a = e?.provenance?.acquire ?? {};
    return [...(a.ccel_ids ?? []), a.ccel_author ? `author:${a.ccel_author}` : null].filter(Boolean);
  }),
);

/**
 * The register, read off the work's own title. Ordered most-specific first.
 * Every rule here answers "what KIND of thing is this", never "what is it about".
 */
function registerOf(title, id) {
  const t = title.toLowerCase();
  // The Ante-Nicene / Nicene-and-Post-Nicene Fathers series, by its own id. Explicit rather than
  // title-matched: these volumes are titled by their contents, not by the series.
  if (/^schaff\/(anf|npnf)/i.test(id)) return { type: 'father', why: 'ANF/NPNF series id' };
  // Calvin's Commentaries, by series id. Their volume titles name the BOOK expounded ("Harmony of
  // the Law - Volume 1"), not the genre, so the title rules below cannot see what they are.
  if (/^calvin\/calcom\d+$/i.test(id)) return { type: 'commentary', why: 'Calvin Commentaries series id' };
  if (/\bcreeds?\b|\bconfession|\bcatechism/.test(t)) return { type: 'confession', why: 'creeds/confession/catechism' };
  if (/\bdictionary\b|\bencyclopedia\b|\blexicon\b|\bconcordance\b/.test(t)) return { type: 'lexicon', why: 'reference work' };
  if (/\bhymn|\bpsalter\b|\bcarol/.test(t)) return { type: 'hymn', why: 'hymn/psalter' };
  if (/\bpoems?\b|\bpoetry\b|\bverses?\b(?! of)/.test(t)) return { type: 'poetry', why: 'poems/verse' };
  if (/daily|morning and evening|devotional|day by day/.test(t)) return { type: 'devotional', why: 'daily/devotional' };
  if (/\bhistory\b|\bchronicle|\bantiquities\b|\bmartyrs\b/.test(t)) return { type: 'historian', why: 'history' };
  // Exegesis LAST among the specific rules, so "Sermons on Genesis" is a sermon.
  if (/\bsermons?\b|\bhomil/.test(t)) return { type: 'sermon', why: 'sermons/homilies' };
  if (/\bcommentar|\bexposition|\bexpositor|\bnotes on\b|\bexegesis\b/.test(t)) {
    return { type: 'commentary', why: 'commentary/exposition' };
  }
  return { type: 'theology', why: 'DEFAULT — unclassified, filed to a labeled lane, never the pool' };
}

const slugify = (id, title) => {
  const [author, work] = id.split('/');
  return `${author}-${work}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
};

const ingestable = survey.results.filter((r) => r.verdict === 'ingestable');
const entries = [];
const skipped = [];
const ambiguous = [];

for (const w of limit > 0 ? ingestable.slice(0, limit) : ingestable) {
  if (existingIds.has(w.id)) { skipped.push(`${w.id}: already in the manifest`); continue; }
  const slug = slugify(w.id, w.title);
  if (existingSlugs.has(slug)) { skipped.push(`${w.id}: slug ${slug} taken`); continue; }
  const { type, why } = registerOf(w.title, w.id);
  if (why.startsWith('DEFAULT')) ambiguous.push({ slug, id: w.id, title: w.title });
  const title = w.title.replace(/&#0?39;/g, "'").replace(/&amp;/g, '&').replace(/&quot;/g, '"');
  entries.push({
    id: slug, slug, title,
    author: w.author, author_died: w.authorDied ?? null, year_written: w.year ?? null,
    source_type: type, tradition: 'unassigned', era: 'unassigned',
    license: w.licence, tier: 3,
    provenance: {
      url: `https://www.ccel.org/ccel/${w.id}`,
      edition: `${title} (CCEL)`,
      // REQUIRED by license-manifest.ts's edition-trap guard. `year_basis` travels with it so the
      // two sources are never confused: 'printSourceInfo' is CCEL's stated print year;
      // 'authorDeathUpperBound' is a bound, used where CCEL states none, and sound for the
      // licensing question because nobody publishes after dying.
      year: w.year,
      year_basis: w.yearBasis,
      licence_basis: w.licenceBasis,
      acquire: { adapter: 'ccel', ccel_ids: [w.id], strip_markup: true },
    },
  });
  existingSlugs.add(slug);
}

const byType = entries.reduce((m, e) => ({ ...m, [e.source_type]: (m[e.source_type] ?? 0) + 1 }), {});
console.log(`${ingestable.length} ingestable · ${entries.length} new entries · ${skipped.length} skipped\n`);
console.log('by register:');
for (const [t, n] of Object.entries(byType).sort((a, b) => b[1] - a[1])) {
  const pool = t === 'commentary' || t === 'father' ? '  <- COMPOSED /ask pool' : '';
  console.log(`  ${String(n).padStart(4)}  ${t.padEnd(12)}${pool}`);
}
console.log(`\nunclassified (defaulted to the theology lane): ${ambiguous.length}`);
for (const a of ambiguous.slice(0, 10)) console.log(`   ${a.id.padEnd(28)} ${a.title.slice(0, 52)}`);

if (WRITE) {
  fs.writeFileSync('ingest/sources.config.json', `${JSON.stringify([...manifest, ...entries], null, 2)}\n`);
  console.log(`\nWROTE ${entries.length} entries — manifest is now ${manifest.length + entries.length}`);
} else {
  fs.mkdirSync('docs/evidence', { recursive: true });
  fs.writeFileSync('docs/evidence/ccel-proposed-entries.json', `${JSON.stringify({ byType, ambiguous, entries }, null, 2)}\n`);
  console.log('\nDRY RUN — nothing written to the manifest. Proposal at docs/evidence/ccel-proposed-entries.json');
}

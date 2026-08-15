// §B1 — PER-REGISTER END-TO-END. For every register that has a published work, the
// five things a reader actually does, driven through the REAL route handlers:
//
//   1. the catalog lists the work, with its author/title/register label
//   2. the Book Reader opens it — TOC groups into REAL reading units, not chunk artifacts
//   3. a distinctive phrase FROM that work comes back from search, deduped to ONE unit
//   4. the search result LANDS ON THE PASSAGE — the section it points at contains the phrase
//   5. attribution is author + work on every surface, and never a host URL
//
// Why this file exists: the existing reader/search invariants prove those properties for
// two slugs (calvin-institutes, herbert-temple) — theology and poetry. Nine registers are
// published on dev. A property proven on 2 of 9 registers is not a property of the corpus,
// and "the corpus works" is exactly the claim being made.
//
// The representative work per register is DISCOVERED (most sections, ties broken by slug),
// never named, so a new register or a re-slice cannot silently fall out of coverage — the
// way work-reader.test.ts's hard-named staged fixture did on 2026-07-24.
//
// DB-backed: skips when no runtime DB URL is configured, executes for real otherwise.

import { describe, expect, it } from 'vitest';
import { GET as getWork } from '@/app/api/work/[slug]/route';
import { GET as getWorkSections } from '@/app/api/work/[slug]/sections/route';
import { GET as getSearchWorks } from '@/app/api/search/works/route';
import { CATALOGS, type CatalogId } from '@/lib/catalog';
import { listCatalogWorks } from '@/lib/catalog';
import { getDb } from '@/lib/db';
import type { WorkSectionsPage, WorkTocUnit } from '@/lib/work';
import { runtimeDbUrl } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';

const dbUrl = runtimeDbUrl();

/** Registers that reach NO catalog, BY CONSTRUCTION (lib/catalog.ts's fail-closed default:
 *  a source_type not named by a catalog appears in none). Declared here so that a register
 *  losing its catalog door reads as a CHANGE rather than as silence. `lexicon` belongs to
 *  Word Study, its own surface.
 *
 *  `historian` was in this set until 2026-08-01, when the owner ruled it gets its own
 *  Historians catalog — it is not lane content (neither exegesis nor devotional register), it
 *  simply had no shelf. `theology`/`confession` left this set on 2026-08-02, same reasoning,
 *  same remedy: 33,578 sections (calvin-institutes, hodge-systematic, owen-works,
 *  schaff-creeds) were published, lane-served, and unbrowsable, because "must never be
 *  presented AS exegesis" — the actual wall — had been standing in for "must have no shelf at
 *  all", which is a narrower claim it does not entail. The wall itself is unchanged: `theology`
 *  is still not in `commentaries.types` (catalog-defs.ts), so it still cannot masquerade as
 *  commentary, and it still cannot fill an exegetical voice slot. This guard is what turns each
 *  such change into an explicit decision instead of a silent widening: adding a catalog makes
 *  this assertion RED in CI, exactly as the comment above intends. Removing a register from this
 *  list must always cost someone a red build.
 *
 *  `topical_index` (openbible-topics) joined this set on 2026-08-10, same reasoning as
 *  `lexicon`: it already has its OWN surface — Plans topic matching (lib/plan/topic-match.ts,
 *  /api/plans/topics, covered by test/regression/plan-topic-flow.test.ts) — and its sections
 *  are verse-reference lists, not reader prose. Giving it a catalog shelf would be a product
 *  decision, exactly the kind this pin exists to force into the open. */
const REGISTERS_WITH_NO_CATALOG = ['lexicon', 'topical_index'] as const;

/** Works whose reading unit legitimately IS the section — the content's own shape, not a
 *  chunking artifact. The §B1 TOC check below measures GROUPING (a work must have fewer
 *  reading units than raw sections); these works are exempt, each for a stated reason:
 *    - openbible-topics: a topical index — each section is ONE topic, a verse-reference
 *      list (median ~200 chars); the topic is the indivisible unit.
 *    - schaff-dictionarybible: a Bible dictionary ingested as 29 letter-ranges; the range
 *      is the unit as published, and its reader surface is Word Study, not the Book Reader.
 *    - spurgeon-morning-evening: one COMPLETE dated devotional per section (own heading,
 *      median ~1.9k chars) — the day is the unit.
 *    - watts-psalmshymns: one complete hymn/psalm per section, each with its own title.
 *  Keyed by slug: representatives are discovered, but content shape is a per-work fact.
 *  A work NOT in this set whose units equal its raw section count fails below — that is
 *  the chunk-artifact shape migration 024 exists to prevent. Adding a work here is the
 *  same kind of declared decision as the no-catalog pin above. */
const UNIT_PER_SECTION_WORKS = new Set([
  'openbible-topics',
  'schaff-dictionarybible',
  'spurgeon-morning-evening',
  'watts-psalmshymns',
]);

/** Registers whose sections carry no reader prose, so the quoted-phrase probe (checks 3–5)
 *  has nothing to draw from: topical_index bodies are verse-reference lists ("Exodus 20:1–
 *  Exodus 20:26; Galatians 5:14; …"), median ~200 chars. The register's search surface is
 *  Plans topic matching, covered by plan-topic-flow.test.ts. Checks 1–2 (catalog, reader
 *  TOC) and the host-URL leak check still run for these registers. */
const NO_PROSE_PHRASE_REGISTERS = new Set(['topical_index']);

function catalogFor(sourceType: string): CatalogId | null {
  for (const c of Object.values(CATALOGS)) if (c.types.includes(sourceType)) return c.id;
  return null;
}

interface Rep { sourceType: string; slug: string; title: string; author: string; sections: number }

async function representatives(): Promise<Rep[]> {
  const sql = getDb();
  return (await sql`
    SELECT DISTINCT ON (s.source_type)
           s.source_type AS "sourceType", s.slug, s.title, s.author,
           count(sec.id)::int AS sections
      FROM sources s JOIN sections sec ON sec.source_id = s.id
     WHERE s.status = 'published'
     GROUP BY s.source_type, s.slug, s.title, s.author
     ORDER BY s.source_type, count(sec.id) DESC, s.slug`) as unknown as Rep[];
}

/** A phrase long enough to be distinctive, taken from the MIDDLE of the work so it is not a
 *  title, an epigraph, or front matter. Returns null when no section is prose-y enough. */
async function distinctivePhrase(slug: string): Promise<{ phrase: string; ordinal: number } | null> {
  const sql = getDb();
  const rows = (await sql`
    SELECT sec.ordinal, sec.body
      FROM sections sec JOIN sources s ON s.id = sec.source_id
     WHERE s.slug = ${slug} AND length(sec.body) BETWEEN 200 AND 20000
     ORDER BY sec.ordinal
     OFFSET (SELECT greatest(0, count(*) / 2) FROM sections sec2
              JOIN sources s2 ON s2.id = sec2.source_id
             WHERE s2.slug = ${slug} AND length(sec2.body) BETWEEN 200 AND 20000)
     LIMIT 1`) as { ordinal: number; body: string }[];
  const row = rows[0];
  if (!row) return null;
  // A CONTIGUOUS run of tokens. The first version of this filtered short words out AFTER
  // splitting, which silently made the "phrase" non-contiguous in the source text — so a
  // quoted phrase search correctly returned nothing and all nine registers failed
  // identically. That uniformity was the tell: a check that fails everywhere is usually
  // wrong about itself. Adjacency is the whole point of a phrase probe, so it is preserved
  // here: tokens keep their order, only edge punctuation is trimmed, and a window is only
  // accepted when every token in it still carries letters.
  const tokens = row.body.replace(/\s+/g, ' ').trim().split(' ')
    .map((w) => w.replace(/^[^A-Za-z']+|[^A-Za-z']+$/g, ''));
  const WINDOW = 7;
  const mid = Math.floor(tokens.length / 2);
  for (let i = Math.max(0, mid - 20); i + WINDOW <= tokens.length; i++) {
    const win = tokens.slice(i, i + WINDOW);
    // every token real, and enough long ones that the phrase is not all stopwords
    if (win.some((w) => w.length < 2)) continue;
    if (win.filter((w) => w.length >= 4).length < 4) continue;
    return { phrase: win.join(' '), ordinal: row.ordinal };
  }
  return null;
}

const callWork = (slug: string) =>
  getWork(new Request(`https://test.local/api/work/${slug}`), { params: Promise.resolve({ slug }) });
const callSections = (slug: string, qs = '') =>
  getWorkSections(new Request(`https://test.local/api/work/${slug}/sections${qs}`), {
    params: Promise.resolve({ slug }),
  });
const callSearch = (qs: string) => getSearchWorks(new Request(`https://test.local/api/search/works?${qs}`));

interface SearchHit {
  slug: string; title: string; author: string; sourceType: string;
  ordinal: number; unitOrdinal: number | null; heading: string | null; snippet: string;
}

// A DB-less run must READ as NOT RUN, not as coverage — see helpers/loud-skip.ts.
const SKIP = announceSkip(
  '§B1 per-register end-to-end (real route handlers, real DB)',
  [{ name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) }],
  'the five per-register reader checks: catalog, reader, search, link-lands-on-passage, attribution',
);

describe.skipIf(SKIP)('§B1 per-register end-to-end (real route handlers, real DB)', () => {
  it('every published register has a representative work, and the no-catalog set is exactly as declared', async () => {
    const reps = await representatives();
    // POSITIVE CONTROL: a corpus with no published registers would make every per-register
    // assertion below vacuous, so the discovery itself has to be non-empty.
    expect(reps.length, 'no published register has any section — every check below would be vacuous').toBeGreaterThan(0);
    const noCatalog = reps.filter((r) => catalogFor(r.sourceType) === null).map((r) => r.sourceType).sort();
    expect(
      noCatalog,
      'a published register reaches no catalog. That is lib/catalog.ts\'s fail-closed default, but it means a reader cannot DISCOVER these works — only open them by direct URL. Changing this set is an owner decision, so it is pinned here.',
    ).toEqual([...REGISTERS_WITH_NO_CATALOG].filter((t) => reps.some((r) => r.sourceType === t)).sort());
  }, 60_000);

  it('runs the five reader checks for every published register', async () => {
    const reps = await representatives();
    const failures: string[] = [];
    const log: string[] = [];

    for (const rep of reps) {
      const where = `${rep.sourceType}/${rep.slug}`;
      const note = (m: string) => failures.push(`${where}: ${m}`);

      // ── 1. CATALOG ────────────────────────────────────────────────────────────
      const cat = catalogFor(rep.sourceType);
      if (cat) {
        const { works } = await listCatalogWorks({ catalog: cat, limit: 500 });
        const hit = works.find((w) => w.slug === rep.slug);
        if (!hit) note(`catalog "${cat}" does not list it`);
        else {
          if (hit.author !== rep.author) note(`catalog author "${hit.author}" != sources.author "${rep.author}"`);
          if (hit.title !== rep.title) note(`catalog title "${hit.title}" != sources.title "${rep.title}"`);
          if (hit.sourceType !== rep.sourceType) note(`catalog register label "${hit.sourceType}" != "${rep.sourceType}"`);
        }
      }

      // ── 2. BOOK READER: opens, and the TOC groups into REAL units ─────────────
      const workRes = await callWork(rep.slug);
      if (workRes.status !== 200) { note(`reader route returned ${workRes.status}`); continue; }
      const workBody = (await workRes.json()) as { source: Record<string, unknown>; toc: WorkTocUnit[] };
      const toc = workBody.toc;
      if (toc.length === 0) note('TOC is empty');
      const nullUnits = toc.filter((r) => typeof r.unitOrdinal !== 'number').length;
      if (nullUnits > 0) note(`${nullUnits}/${toc.length} TOC rows have no unitOrdinal — the reader would list one "unit" per retrieval chunk`);
      const units = new Set(toc.map((r) => r.unitOrdinal)).size;
      // The measured property: unit_ordinal must actually GROUP — fewer reading units than
      // raw sections — unless the work is declared unit-per-section (UNIT_PER_SECTION_WORKS).
      // The pre-2026-08-10 line compared `units` to `toc.length`, but 79494d4 (2026-08-02)
      // made the TOC one row PER UNIT, which turned that into a tautology firing on every
      // well-grouped large work: john-gill's 28,843 sections group into 1,169 real units
      // and the old line still flagged "every one of 1169 sections".
      if (rep.sections > 20 && units === rep.sections && !UNIT_PER_SECTION_WORKS.has(rep.slug)) {
        note(`all ${rep.sections} sections are their own reading unit — unit_ordinal carries no grouping (chunk artifacts); if the section IS the unit for this work, declare it in UNIT_PER_SECTION_WORKS`);
      }
      if (/https?:\/\//.test(JSON.stringify(workBody.source))) note('reader source payload leaks a host URL');

      // No-prose registers stop here: catalog, TOC and the URL-leak check above have run;
      // the quoted-phrase probe has nothing to draw from (NO_PROSE_PHRASE_REGISTERS).
      if (NO_PROSE_PHRASE_REGISTERS.has(rep.sourceType)) {
        log.push(`  ${rep.sourceType.padEnd(11)} ${rep.slug.padEnd(24)} sections=${String(rep.sections).padStart(6)} units=${units} catalog=${cat ?? '(none)'} phrase-probe=n/a (no-prose register)`);
        continue;
      }

      // ── 3+4. SEARCH finds it, deduped, and the hit LANDS ON THE PASSAGE ───────
      const picked = await distinctivePhrase(rep.slug);
      if (!picked) { note('no section long enough to draw a distinctive phrase from'); continue; }
      const searchRes = await callSearch(`q=${encodeURIComponent(`"${picked.phrase}"`)}&limit=20`);
      if (searchRes.status !== 200) note(`search returned ${searchRes.status}`);
      const hits = ((await searchRes.json()) as { results: SearchHit[] }).results ?? [];
      const mine = hits.filter((h) => h.slug === rep.slug);
      if (mine.length === 0) {
        note(`its own distinctive phrase "${picked.phrase}" does not come back from search`);
      } else {
        const unitKeys = new Set(mine.map((h) => h.unitOrdinal ?? -h.ordinal));
        if (unitKeys.size !== mine.length) note(`search returned ${mine.length} hits over ${unitKeys.size} reading unit(s) — not deduped to one per unit`);

        // 4. follow the link: the section the hit points at must CONTAIN the phrase.
        const hit = mine[0]!;
        const page = await callSections(rep.slug, `?after=${hit.ordinal - 1}&limit=1`);
        if (page.status !== 200) note(`following the result to ordinal ${hit.ordinal} returned ${page.status}`);
        else {
          const sec = ((await page.json()) as WorkSectionsPage).sections[0];
          if (!sec) note(`following the result to ordinal ${hit.ordinal} returned no section`);
          else if (sec.ordinal !== hit.ordinal) note(`result points at ordinal ${hit.ordinal} but the reader served ${sec.ordinal}`);
          else {
            // The landed section must be a GENUINE MATCH for the query — not necessarily a
            // literal substring. Search dedupes to one result per reading unit and picks the
            // best-ranked matching section in that unit, and Postgres matches on STEMMED
            // lexemes, so `body.includes(phrase)` is the wrong property: it failed for
            // confession/father/hymn/theology purely because the unit's best-ranked match was
            // a sibling section or a stem variant. Ask the same operator production asks.
            const sql = getDb();
            const matching = (await sql`
              SELECT sec.ordinal FROM sections sec JOIN sources s ON s.id = sec.source_id
               WHERE s.slug = ${rep.slug}
                 AND sec.tsv @@ websearch_to_tsquery('english', ${`"${picked.phrase}"`})`) as { ordinal: number }[];
            const ords = new Set(matching.map((m) => m.ordinal));
            if (ords.size === 0) note('the phrase matches no section at all — the probe is broken, not the corpus');
            else if (!ords.has(sec.ordinal)) {
              note(`the link lands on ordinal ${sec.ordinal}, which is NOT one of the ${ords.size} section(s) matching the query — the result points somewhere else`);
            }
            // and the section the phrase was drawn FROM must itself be a match, or the probe lied
            if (!ords.has(picked.ordinal)) note(`the phrase was drawn from ordinal ${picked.ordinal} but that section does not match the query — probe defect`);
          }
        }

        // ── 5. ATTRIBUTION: author + work, never a host URL ─────────────────────
        if (!hit.author?.trim()) note('search hit carries no author');
        if (!hit.title?.trim()) note('search hit carries no work title');
        if (/https?:\/\//.test(JSON.stringify(hit))) note('search hit leaks a host URL');
      }

      log.push(`  ${rep.sourceType.padEnd(11)} ${rep.slug.padEnd(24)} sections=${String(rep.sections).padStart(6)} units=${units} catalog=${cat ?? '(none)'}`);
    }

    console.log(`\n§B1 per-register end-to-end — ${reps.length} register(s):\n${log.join('\n')}`);
    expect(failures, `§B1 failures:\n  - ${failures.join('\n  - ')}`).toEqual([]);
  }, 300_000);
});

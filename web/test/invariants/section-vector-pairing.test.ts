// §B0 class 2 — CONTENT ↔ VECTOR PAIRING. The one seeded defect class that nothing in
// this repo caught.
//
// The seed: rotate one work's section vectors by a single section, so every body carries
// its neighbour's embedding. Bodies are untouched, row counts are untouched, and the
// multiset of vectors is untouched — so EVERY existing check stays green:
//   * E4's 1:1 postcondition (sections == section_embeddings == flat rows) — green
//   * the reader, the TOC, unit_ordinal, the FTS search (tsv is GENERATED from body) — green
//   * the whole 23-test DB-backed suite, run against a seeded fork — green
// while every semantic retrieval over that work returns the passage NEXT DOOR. A 1:1 count
// green on a mispaired corpus is exactly the false green this run exists to find.
//
// Counting cannot detect this, and neither can any nearest-neighbour probe: a rotation is a
// permutation, so each vector still appears exactly once and every section is still its own
// nearest neighbour at distance 0. The only signal that distinguishes a paired corpus from a
// permuted one is the TEXT ITSELF, so this check re-embeds the body with the SHIPPED embedder
// and compares it to the stored vector.
//
// Cost control: ONE section per published work (35 embed calls on dev), and only where the
// body is short enough that the embedder's input is byte-identical to what ingest embedded
// (no truncation), so a correct pairing scores ~1.0 rather than "high-ish".
//
// Without a DB or DEEPINFRA_API_KEY it does not silently skip — it announces NOT RUN through
// helpers/loud-skip.ts, because neither CI job supplies the key today.

import { describe, expect, it } from 'vitest';
import { getDb } from '@/lib/db';
import { embedQuery } from '@/lib/teacher/deepinfra';
import { runtimeDbUrl } from '../helpers/env';
import { localEnv } from '../helpers/env';
import { announceSkip } from '../helpers/loud-skip';
import { isProviderUnavailable, probeProvider } from '../helpers/provider-availability';

const dbUrl = runtimeDbUrl();
const hasKey = Boolean(process.env.DEEPINFRA_API_KEY ?? localEnv('DEEPINFRA_API_KEY'));

// CALIBRATED AGAINST BOTH POPULATIONS, not to taste. Measured on dev 2026-07-29:
//   * correctly paired PROSE sections            → 0.98 – 1.00
//   * correctly paired VERSE sections (hymn/poetry) → 0.9246 – 0.94  (see below)
//   * a seeded MISPAIR (herbert-temple vectors rotated by one section) → 0.7828
// So the threshold has to separate ~0.92 from ~0.78, not 1.00 from 0.99.
//
// WHY VERSE SCORES LOWER, and why that is a finding rather than noise: for hymn/poetry the
// stored vector was not computed on the bytes now in `sections.body`. The verse register keeps
// its lineation (§B2 — verse is pre-wrap), and the ingest embedded a whitespace-normalised
// rendering, so re-embedding the stored body gives ~0.93 instead of ~1.0. That is a FIDELITY
// gap, not a mispairing — the passage is the right one — but it means verse vectors are
// slightly off the text the reader sees. Reported, not silently absorbed: the fix is a
// re-embed of the verse registers from the stored body, which is a corpus change.
const SELF_MIN_PROSE = 0.95;
const SELF_MIN_VERSE = 0.90;
const VERSE_TYPES = new Set(['hymn', 'poetry']);
const MARGIN = 0.05;

function cosine(a: number[], b: number[]): number {
  let dot = 0, na = 0, nb = 0;
  for (let i = 0; i < a.length; i++) { dot += a[i]! * b[i]!; na += a[i]! * a[i]!; nb += b[i]! * b[i]!; }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** pgvector comes back as '[0.1,-0.2,…]'. */
function parseVector(v: unknown): number[] {
  if (Array.isArray(v)) return v as number[];
  return String(v).replace(/^\[|\]$/g, '').split(',').map(Number);
}

interface Sample { slug: string; sourceType: string; ordinal: number; body: string; embedding: unknown }

// THIS CHECK IS THE ONE MOST LIKELY TO SILENTLY NOT RUN, and it is the only thing standing
// between the corpus and a content↔vector mispairing that every counting check waves through.
// Neither CI job supplies DEEPINFRA_API_KEY today, so without this announcement it would skip
// in silence forever while `npm run audit` stayed green — a fresh instance of exactly the
// green-by-skip pattern this repo already documents for the DB invariants.
const SKIP = announceSkip(
  '§B0 class 2 — content↔vector pairing',
  [
    { name: 'a runtime DB URL (APP_DATABASE_URL)', present: Boolean(dbUrl) },
    { name: 'DEEPINFRA_API_KEY', present: hasKey },
  ],
  'that every published section body still matches its OWN stored embedding — the mispairing class that leaves row counts, 1:1 assertions, the reader, the TOC and FTS all green while semantic search returns the passage next door',
);

describe.skipIf(SKIP)('§B0 class 2 — every section body matches its own stored vector', () => {
  // `ctx` is load-bearing, not decoration. A bare `return` out of a test body is reported by
  // vitest as PASSED — so every provider-unavailable exit below used to announce NOT RUN in the
  // log and then hand CI a green tick. Both receipts were structurally blind to it:
  // ci-skip-ceiling.mjs counts a file only when pending === total (this file has one test), and
  // ci-db-invariants-receipt.mjs fails only when executed === 0. One DeepInfra 429 — which has
  // happened, at ca53457 — turned the ONLY check standing between the corpus and content/vector
  // mispairing into `executed=N passed=N failed=0`. `ctx.skip()` is what loud-skip.ts:31 has
  // always said this must be: "never a failure and never a pass". (2026-08-02 deep audit, T1.)
  it('re-embedding the body reproduces the stored vector, and discriminates against a neighbour', async (ctx) => {
    if (!process.env.DEEPINFRA_API_KEY) process.env.DEEPINFRA_API_KEY = localEnv('DEEPINFRA_API_KEY');
    const sql = getDb();
    // One section from EVERY published work. Per-REGISTER sampling was the first version and it
    // did not catch the seeded mispair: the seed was confined to herbert-temple, and the poetry
    // representative was a different work. A mispair is per-work — it is what a bad re-slice of
    // ONE work produces — so the sample has to be per-work or it is not coverage.
    // Bodies are bounded so the embedder input is identical to what ingest embedded (no
    // truncation) and a correct pairing scores ~1.0 rather than merely "high".
    // The upper bound is 1200, not a char-estimate of the 512-token window: dense reference
    // text (verse-index lines, Latin with diacritics) tokenizes past 512 below ~1,700 chars —
    // measured 2026-08-13, when the 91-work backfill made such sections samplable and the API
    // 400'd mid-run ("You passed 513 input tokens"). 1200 is the bound ingest itself sends per
    // chunk (EMBED_MAX). The NOT COVERED list below keeps the cost of that bound visible.
    const samples = (await sql`
      SELECT DISTINCT ON (s.slug)
             s.slug, s.source_type AS "sourceType", sec.ordinal, sec.body, se.embedding
        FROM sections sec
        JOIN sources s ON s.id = sec.source_id
        JOIN section_embeddings se ON se.section_id = sec.id
       WHERE s.status = 'published' AND length(sec.body) BETWEEN 300 AND 1200
       ORDER BY s.slug, sec.ordinal`) as unknown as Sample[];

    // NO SILENT CAPS: a published work with no section in the sampleable range is NOT covered,
    // and that has to be visible rather than read as "all clear". CAUSES REPORTED SEPARATELY
    // (2026-08-12, EMBEDDINGS_DESIGN V3 / I-3): the JOIN above drops VECTORLESS works silently,
    // and until this fix they printed under "no section of sampleable length" — a true fact
    // with a false reason. Measured the day this was fixed: all 91 uncovered works on dev were
    // vectorless, zero were unsampleable. The two causes must never merge again.
    const covered = new Set(samples.map((s) => s.slug));
    const publishedWorks = (await sql`
      SELECT s.slug FROM sources s
       WHERE s.status = 'published' AND EXISTS (SELECT 1 FROM sections x WHERE x.source_id = s.id)
       ORDER BY s.slug`) as { slug: string }[];
    const uncovered = publishedWorks.map((w) => w.slug).filter((s) => !covered.has(s));
    const vectorlessRows = (uncovered.length
      ? await sql`
        SELECT DISTINCT s.slug FROM sources s
         WHERE s.slug = ANY(${uncovered})
           AND NOT EXISTS (SELECT 1 FROM sections sec
                            JOIN section_embeddings se ON se.section_id = sec.id
                           WHERE sec.source_id = s.id)`
      : []) as { slug: string }[];
    const vectorless = new Set(vectorlessRows.map((r) => r.slug));
    const unsampleable = uncovered.filter((s) => !vectorless.has(s));
    console.log(`§B0 class 2 — pairing probed on ${samples.length}/${publishedWorks.length} published works` +
      (uncovered.length
        ? `; NOT COVERED: ${uncovered.length} — vectorless (no section_embeddings): ${vectorless.size}` +
          (vectorless.size ? ` [${[...vectorless].join(', ')}]` : '') +
          `; no section of sampleable length: ${unsampleable.length}` +
          (unsampleable.length ? ` [${unsampleable.join(', ')}]` : '')
        : '; all covered'));

    // POSITIVE CONTROL on the sampling itself: no samples means every assertion below is
    // vacuous, which is the failure mode this whole file exists to close.
    expect(samples.length, 'no published section is short enough to sample — this check would pass vacuously').toBeGreaterThan(0);

    // PROVIDER AVAILABILITY, before asserting anything. A 429 from DeepInfra is not evidence about
    // this invariant — it is the absence of evidence. `ca53457` (docs-only) went RED on exactly that
    // and passed on re-run with no change. Probe once with a bounded retry; if the provider is down,
    // announce NOT RUN through the same taxonomy as a missing secret or a missing artifact, and
    // return without asserting. A genuine failure (400/401, or a wrong vector) re-throws and stays RED.
    const probe = await probeProvider(() => embedQuery(samples[0]!.body));
    if (announceSkip(
      '§B0 class 2 — section/vector pairing',
      [{ name: `DeepInfra embeddings (unavailable after ${probe.attempts} attempts: ${probe.error ?? ''})`, present: probe.present, kind: 'provider' }],
      'every published section body matching its own stored vector, and discriminating against a neighbour',
    )) { ctx.skip(); return; }

    const failures: string[] = [];
    for (let i = 0; i < samples.length; i++) {
      const s = samples[i]!;
      const stored = parseVector(s.embedding);
      let fresh: number[];
      try {
        fresh = await embedQuery(s.body);
      } catch (err) {
        // The provider went down mid-run, after the probe said it was up.
        if (isProviderUnavailable(err)) {
          announceSkip(
            '§B0 class 2 — section/vector pairing (provider failed mid-run)',
            [{ name: `DeepInfra embeddings (${err instanceof Error ? err.message : String(err)})`, present: false, kind: 'provider' }],
            'the remaining published sections in this run',
          );
          ctx.skip();
          return;
        }
        throw err;
      }
      const self = cosine(stored, fresh);

      // Discrimination control, in the SAME run: the stored vector of a DIFFERENT section must
      // score materially lower against this body. Without it, an embedder that returned a
      // constant vector — or a cosine that always returned 1 — would read as a pass.
      //
      // The control must be TEXTUALLY distinct, not just a different row. Samples are ordered by
      // slug, so the naive next-sample control is often the adjacent VOLUME of the same
      // multi-volume work — and multi-volume works reprint front matter verbatim (measured
      // 2026-08-13: schaff-encyc01#4 vs 02#3 vs 09#3 are the same "SYSTEM OF TRANSLITERATION"
      // page at 623-627 chars; cos 1.0000 to the "neighbour" is the embedder being RIGHT).
      // Identical text cannot be discriminated by any vector; walk forward to the first
      // textually distinct sample. If none exists the leg is vacuous for this pair — said
      // loudly, not passed silently.
      const normTokens = (t: string) => new Set(
        // NFKD + strip combining marks first: the duplicate front matter differs by precomposed
        // vs combining diacritics (ḥ vs ḥ) and layout punctuation, which defeats a naive token
        // Jaccard (measured 2026-08-13: schaff-encyc09#3 slipped a 0.9 threshold at ~0.8 while
        // being the same page). Fold to plain alphanumeric tokens before comparing.
        t.normalize('NFKD').replace(/\p{M}/gu, '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim().split(' '),
      );
      const jaccard = (a: Set<string>, b: Set<string>) => {
        let inter = 0;
        for (const tok of a) if (b.has(tok)) inter++;
        return inter / (a.size + b.size - inter || 1);
      };
      const sTokens = normTokens(s.body);
      let other = samples[(i + 1) % samples.length]!;
      let hop = 0;
      while (hop < samples.length - 1 && jaccard(sTokens, normTokens(other.body)) >= 0.9) {
        hop++;
        other = samples[(i + 1 + hop) % samples.length]!;
      }
      const otherScore = cosine(parseVector(other.embedding), fresh);

      const where = `${s.sourceType}/${s.slug}#${s.ordinal}`;
      const floor = VERSE_TYPES.has(s.sourceType) ? SELF_MIN_VERSE : SELF_MIN_PROSE;
      if (self < floor) {
        failures.push(`${where}: body vs its OWN stored vector cos=${self.toFixed(4)} < ${floor} — this section's text and its embedding are not the same passage`);
      }
      if (samples.length > 1 && hop < samples.length - 1 && self < otherScore + MARGIN) {
        failures.push(`${where}: cos to own vector ${self.toFixed(4)} is not clear of cos to ${other.slug}#${other.ordinal} ${otherScore.toFixed(4)} — the probe is not discriminating`);
      }
    }
    expect(failures, `content↔vector pairing:\n  - ${failures.join('\n  - ')}`).toEqual([]);
  }, 180_000);
});

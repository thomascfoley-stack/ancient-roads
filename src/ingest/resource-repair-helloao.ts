// Provenance-repair the helloao PD commentaries (Gill, JFB, Clarke, Matthew
// Henry) — the 62,708-entry no-provenance bucket (RESOURCING_PLAN §8). Drives the
// reusable re-source pipeline: the shared matcher (resource-textmatch.ts) over the
// helloao SourceAdapter (helloao-source.ts). FULL per-work verification (all
// books): fetch every helloao verse, compare to our stored text, classify, then
// write a clean config entry with helloao PD provenance + a forward-compatible
// rebuild recipe + the truncation stats.
//
//   npx tsx src/ingest/resource-repair-helloao.ts
//
// $0: keeps the existing (some truncated) text + vectors; verifies the text IS
// helloao's PD text. No re-embed/rebuild (eval-gated later). No publish.

import pg from 'pg';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { helloaoAdapter, HELLOAO_PD_WORKS } from './helloao-source.js';
import { tokens, tallyMatch, repairOf, repairPct } from './resource-textmatch.js';

const MANIFEST = 'ingest/sources.config.json';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('web/.env.local')) return undefined;
  return readFileSync('web/.env.local', 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf-8')) as Record<string, unknown>[] : [];
  const byId = new Map(manifest.map((e) => [e.id as string, e]));

  console.log('='.repeat(72));
  console.log('PROVENANCE-REPAIR — helloao PD commentaries (full per-work verification)');
  console.log('='.repeat(72));

  try {
    for (const w of HELLOAO_PD_WORKS) {
      process.stdout.write(`\n${w.author} (${w.commentaryId}) … `);

      // Our stored text per verseId (chunks/entries concatenated).
      const { rows } = await client.query<{ vid: number; txt: string }>(
        `SELECT book*1000000 + chapter*1000 + verse_start AS vid, string_agg(body, ' ' ORDER BY entry_index) AS txt
           FROM commentary_entries WHERE author = $1 AND length(body) >= 100 GROUP BY 1`,
        [w.dataAuthor],
      );
      const stored = new Map<number, Set<string>>(rows.map((r) => [r.vid, tokens(r.txt)]));

      const source = await helloaoAdapter.fetchWork(w.commentaryId);
      const s = tallyMatch(stored, source);
      console.log(`compared ${s.compared}: repair ${repairOf(s)} (${repairPct(s).toFixed(1)}%) [match ${s.match} + trunc ${s.truncated}], genuine-differ ${s.differ}, source-only ${s.sourceOnly}`);

      byId.set(w.slug, {
        id: w.slug, slug: w.slug, title: w.title, author: w.author,
        year_written: w.year, source_type: 'commentary', tradition: w.tradition, era: w.era,
        license: w.license,
        provenance: {
          url: helloaoAdapter.provenanceUrl(w.commentaryId),
          edition: helloaoAdapter.editionLabel(w.commentaryId, w.title),
          year: w.year,
          license_ref: 'CC Public Domain Mark 1.0',
          rebuild: helloaoAdapter.rebuildRecipe(w.commentaryId),
          text_match: {
            verses_compared: s.compared, repair: repairOf(s), repair_pct: Number(repairPct(s).toFixed(2)),
            match: s.match, truncated: s.truncated, genuine_differ: s.differ,
            note: 'truncated = same PD text, our stored copy cut short (vector kept as-is; full text via rebuild recipe)',
          },
        },
        backfill: { match_author: w.dataAuthor },
      });
    }
  } finally {
    await client.end();
  }

  writeFileSync(MANIFEST, JSON.stringify([...byId.values()], null, 2) + '\n');
  console.log(`\n✓ wrote ${MANIFEST} (${byId.size} sources).`);
}

main().catch((e) => { console.error(e); process.exit(1); });

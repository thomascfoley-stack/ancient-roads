// Patristic re-source probe — proves per-work $0-repair against REAL Schaff/ANF
// text (New Advent), the same rigor as helloao, BEFORE scaling the classify to
// ~384 works. For each sampled father-work: fetch the PD edition, and for each of
// our stored verse-snippets, test containment in that text — contained ⇒ same PD
// translation (repair); not ⇒ modern/other (drop). A wrong-source control shows
// the matcher discriminates (not just returning "repair" for any father text).
//
//   npx tsx src/ingest/resource-probe-patristic.ts

import pg from 'pg';
import { readFileSync, existsSync } from 'fs';
import { shingleSet, tallyContainment, containment } from './resource-textmatch.js';
import { fetchNewAdventText, PATRISTIC_SAMPLE, type PatristicWork } from './newadvent-source.js';

// Shingle-containment threshold: fraction of a snippet's 4-grams present in the
// PD work's text. Same translation ⇒ high; different translation ⇒ near zero.
const T = 0.5;

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  if (!existsSync('web/.env.local')) return undefined;
  return readFileSync('web/.env.local', 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function storedSnippets(client: pg.Client, author: string, book: number): Promise<Set<string>[]> {
  const { rows } = await client.query<{ txt: string }>(
    `SELECT string_agg(body, ' ' ORDER BY entry_index) AS txt
       FROM commentary_entries
      WHERE source_url ~* 'historicalchristian' AND author = $1 AND book = $2 AND length(body) >= 100
      GROUP BY chapter, verse_start`,
    [author, book],
  );
  return rows.map((r) => shingleSet(r.txt));
}

async function main() {
  const dbUrl = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!dbUrl) throw new Error('DATABASE_URL required');
  const client = new pg.Client({ connectionString: dbUrl.replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await client.connect();

  console.log('='.repeat(74));
  console.log('PATRISTIC RE-SOURCE PROBE — stored snippets vs real Schaff/ANF text (New Advent)');
  console.log('='.repeat(74));

  const loaded: Array<{ w: PatristicWork; snippets: Set<string>[]; source: Set<string> }> = [];
  try {
    for (const w of PATRISTIC_SAMPLE) {
      const { text, okPages } = await fetchNewAdventText(w.urls);
      const source = shingleSet(text);
      const snippets = await storedSnippets(client, w.author, w.book);
      const s = tallyContainment(snippets, source, T);
      const pct = s.total ? (100 * s.repair / s.total) : 0;
      console.log(`\n${w.author} — ${w.work} [${w.edition}]`);
      console.log(`  source: ${okPages}/${w.urls.length} pages fetched (${source.size} unique tokens)`);
      console.log(`  our snippets: ${s.total} scored → REPAIR ${s.repair} (${pct.toFixed(1)}%), DROP ${s.drop}`);
      loaded.push({ w, snippets, source });
    }

    // Discrimination control: father A's snippets vs father B's source text should
    // NOT falsely repair. Take Chrysostom's snippets vs Augustine's source.
    const chry = loaded.find((x) => x.w.author.includes('Chrysostom'));
    const augSrc = loaded.find((x) => x.w.author.includes('Augustine'))?.source;
    if (chry && augSrc) {
      let hi = 0;
      for (const snip of chry.snippets) if (snip.size >= 8 && containment(snip, augSrc) >= T) hi++;
      const n = chry.snippets.filter((s) => s.size >= 8).length;
      console.log(`\nCONTROL — Chrysostom snippets vs Augustine's text: ${hi}/${n} falsely "repair" (want ~0)`);
    }
  } finally {
    await client.end();
  }

  console.log('\n' + '-'.repeat(74));
  console.log('High per-work REPAIR% + a near-zero control ⇒ the containment match discriminates:');
  console.log('these fathers ARE the PD ANF/NPNF text ($0-repair). Low-REPAIR works → modern');
  console.log('translation → DROP (status=quarantined). Sampled — scale the classify next.');
}

main().catch((e) => { console.error(e); process.exit(1); });

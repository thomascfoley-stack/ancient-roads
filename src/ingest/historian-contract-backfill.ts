// Historian write-contract backfill (HISTORY_RETRIEVAL_DESIGN §9 items 5+7) for
// historian sources ingested via the generic ccel path (schaff-history,
// edersheim-lifetimes): populate sections.period_* from VERBATIM dates in the
// section's own heading ("§ 25. The Council of Nicaea, A.D. 325" → 325), and
// entity anchors from the hand gazetteer (verbatim word-boundary presence).
// Anchors/periods are facts from the text — absent when the heading carries none.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev npx tsx src/ingest/historian-contract-backfill.ts

import pg from 'pg';
import { readFileSync, existsSync } from 'node:fs';
import { verbatimPeriod } from './ingest-historian.js';
import { verbatimAnchors } from './history-gazetteer.js';

function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8').match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]?.trim().replace(/^"|"$/g, '');
}

async function main() {
  const branch = process.env.DATABASE_URL ? process.env.NEON_BRANCH : localEnv('NEON_BRANCH');
  if (branch !== 'dev' && branch !== 'test') throw new Error(`STOP: NEON_BRANCH="${branch ?? '(unset)'}" must be dev|test`);
  const db = new pg.Client({ connectionString: (localEnv('DATABASE_URL') ?? '').replace(/^"|"$/g, ''), ssl: { rejectUnauthorized: false } });
  await db.connect();
  try {
    const rows = await db.query<{ id: string; heading: string | null; body: string; slug: string }>(
      `SELECT s.id, s.heading, s.body, src.slug FROM sections s JOIN sources src ON src.id = s.source_id
       WHERE src.source_type = 'historian' AND s.period_start_year IS NULL`,
    );
    let periods = 0, anchors = 0;
    for (const r of rows.rows) {
      if (r.heading) {
        const p = verbatimPeriod(r.heading); // HEADING ONLY — the body-scan wrong-era scar
        if (p) { await db.query(`UPDATE sections SET period_start_year=$1, period_end_year=$2 WHERE id=$3`, [p.start, p.end, r.id]); periods++; }
      }
      for (const g of verbatimAnchors(r.heading ?? '', r.body)) {
        await db.query(
          `INSERT INTO section_history_anchors (section_id, kind, entity_slug, entity_label)
           VALUES ($1,$2,$3,$4) ON CONFLICT DO NOTHING`, [r.id, g.kind, g.slug, g.label],
        );
        anchors++;
      }
    }
    console.log(`historian backfill: ${rows.rows.length} sections scanned · ${periods} period-tagged (verbatim headings) · ${anchors} entity anchors`);
  } finally {
    await db.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });

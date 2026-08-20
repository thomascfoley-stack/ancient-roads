#!/usr/bin/env node
// Per-work historian ingest digest — the Phase-1/2 gate (historian plan; HISTORY_RETRIEVAL_DESIGN
// §3.1 amendment). READ-ONLY. Reports, flags, and lists gazetteer candidates; admits nothing.
//
//   DATABASE_URL=<owner url> node scripts/historian-digest.mjs --slug=<slug>
import pg from 'pg';

const slug = process.argv.find((a) => a.startsWith('--slug='))?.slice(7);
if (!slug) { console.error('usage: historian-digest.mjs --slug=<slug>'); process.exit(2); }
const url = process.env.DATABASE_URL;
if (!url) { console.error('STOP: DATABASE_URL unset'); process.exit(2); }
const host = new URL(url.replace(/^postgres(ql)?:/, 'http:')).hostname.split('.')[0];

const c = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false } });
await c.connect(); await c.query('BEGIN TRANSACTION READ ONLY');
try {
  const q = async (s, p = []) => (await c.query(s, p)).rows;
  const src = (await q(`SELECT id, status FROM sources WHERE slug=$1`, [slug]))[0];
  if (!src) { console.error(`no sources row for ${slug} on ${host}`); process.exit(1); }
  const sec = (await q(`SELECT count(*)::int n,
      count(*) FILTER (WHERE period_start_year IS NOT NULL)::int dated,
      count(*) FILTER (WHERE heading IS NULL OR heading='')::int unheaded
    FROM sections WHERE source_id=$1`, [src.id]))[0];
  const anc = (await q(`SELECT count(*)::int n, count(DISTINCT a.entity_slug)::int ents
    FROM section_history_anchors a JOIN sections s ON s.id=a.section_id WHERE s.source_id=$1`, [src.id]))[0];
  const vec = (await q(`SELECT count(*)::int n FROM section_embeddings se
    JOIN sections s ON s.id=se.section_id WHERE s.source_id=$1`, [src.id]))[0].n;

  console.log(`digest ${slug} @ ${host} [${src.status}]`);
  console.log(`  sections        ${sec.n}   headed ${sec.n - sec.unheaded}/${sec.n}   vectors ${vec}/${sec.n}${vec === sec.n ? '' : '  *** VECTOR GAP ***'}`);
  console.log(`  anchors         ${anc.n} (${anc.ents} distinct entities)  = ${(anc.n / sec.n).toFixed(2)}/section  (josephus baseline 1.10)`);
  console.log(`  period-dated    ${sec.dated}/${sec.n} sections  (verbatim heading forms only)`);
  const FLAGS = [];
  if (anc.n / sec.n < 0.05) FLAGS.push('anchors ~ZERO: gazetteer blind to this work — curate before serving');
  if (vec !== sec.n) FLAGS.push('vector gap: not every section embedded');
  if (sec.unheaded > 0) FLAGS.push(`${sec.unheaded} unheaded sections`);

  // Gazetteer CANDIDATES: frequent capitalized tokens in this work's text that anchor nothing.
  // DERIVED from the corpus, ADOPTED by a human (editorial curation, verbatim-gated at ingest) —
  // never auto-added, never grown from eval queries.
  const cand = await q(`
    WITH toks AS (
      SELECT (regexp_matches(s.body, '\\m[A-Z][a-z]{3,}\\M', 'g'))[1] AS tok
      FROM sections s WHERE s.source_id = $1)
    SELECT tok, count(*)::int n FROM toks
    WHERE lower(tok) NOT IN ('this','that','there','when','then','they','these','those','which','while','after','before','thus','whilst')
      AND NOT EXISTS (SELECT 1 FROM section_history_anchors a JOIN sections s2 ON s2.id=a.section_id
                       WHERE s2.source_id = $1 AND lower(a.entity_label) = lower(tok))
    GROUP BY tok ORDER BY n DESC LIMIT 20`, [src.id]);
  console.log(`  gazetteer candidates (frequent, unanchored — CURATE, never auto-adopt):`);
  console.log(`     ${cand.map((x) => `${x.tok}(${x.n})`).join(' ')}`);
  console.log(FLAGS.length ? `  FLAGS:\n     ${FLAGS.join('\n     ')}` : '  no flags');
  process.exit(FLAGS.length ? 1 : 0);
} finally { await c.query('ROLLBACK'); await c.end(); }

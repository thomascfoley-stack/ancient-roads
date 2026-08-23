// W-SLICE4 measurement seeder — seeds the dev user the pre-registered AFTER(b) lane-active
// run uses (docs/evidence/swarm-2026-08-22/w-slice4/PRE-REG.md; results in RESULT.md,
// cleanup SQL in the item file). Seeds ONLY the four user_* tables the lane reads, through
// runAsUser so RLS WITH CHECK binds. Idempotent: deletes the seed user's rows first.
//   cd web && NODE_OPTIONS=--conditions=react-server npx tsx --env-file=.env.local src/scripts/seed-slice4-eval-user.mts
import { runAsUser } from '../lib/db';
import { embedChunks } from '../lib/user-corpus/embed';
import { EMBEDDING_DB_SLUG } from '../lib/user-corpus/model';

export const SEED_USER = 'slice4-eval-seed';
const DOC = 'slice4-eval-doc';
const ROM_8 = { s: 45008001, e: 45008039 };

const SECTIONS = [
  'Our text is Romans 8:28, and I would have you weigh it with me, for it is the ground of every comfort we possess in the hour of affliction and the anchor of the soul.',
  'And we know that all things work together for good to them that love God, to them who are the called according to his purpose. There is the promise entire, and I would not have you take one clause of it without the others.',
  'Observe that the apostle does not say all things ARE good, which any mourner could refute, but that they work TOGETHER for good, which is a claim about the end of the weaving and not about the colour of any single thread.',
  'I have known men who could recite the promise and yet could not rest in it, and others, far less able to argue, who laid their whole weight upon it and were not ashamed, for the promise asks trust and not understanding.',
];

async function main() {
  // idempotency: the document delete cascades to sections/embeddings/anchors (migration 100)
  await runAsUser(SEED_USER, (sql) => [sql`DELETE FROM user_documents WHERE user_id = ${SEED_USER}`]);
  const vectors = await embedChunks(SECTIONS);
  if (vectors.length !== SECTIONS.length) throw new Error(`expected ${SECTIONS.length} vectors, got ${vectors.length}`);
  const lit = (v: number[]) => `[${v.join(',')}]`;
  await runAsUser(SEED_USER, (sql) => [
    sql`INSERT INTO user_documents (id, user_id, title, doc_type, status)
        VALUES (${DOC}, ${SEED_USER}, 'Comfort in Affliction (eval seed)', 'sermon', 'ready')`,
    ...SECTIONS.map((body, i) =>
      sql`INSERT INTO user_sections (id, document_id, user_id, ordinal, body)
          VALUES (${`${DOC}-s${i}`}, ${DOC}, ${SEED_USER}, ${i}, ${body})`),
    ...SECTIONS.map((_, i) =>
      sql`INSERT INTO user_section_embeddings (section_id, user_id, model_slug, embedding)
          VALUES (${`${DOC}-s${i}`}, ${SEED_USER}, ${EMBEDDING_DB_SLUG}, ${lit(vectors[i]!)}::vector)`),
    ...SECTIONS.map((_, i) =>
      sql`INSERT INTO user_section_anchors (section_id, user_id, verse_id_start, verse_id_end, channel, confidence)
          VALUES (${`${DOC}-s${i}`}, ${SEED_USER}, ${ROM_8.s}, ${ROM_8.e}, 'explicit', 0.9)`),
  ]);
  const [n] = await runAsUser(SEED_USER, (sql) => [
    sql`SELECT (SELECT count(*)::int FROM user_sections WHERE user_id = ${SEED_USER}) AS s,
               (SELECT count(*)::int FROM user_section_embeddings WHERE user_id = ${SEED_USER}) AS e,
               (SELECT count(*)::int FROM user_section_anchors WHERE user_id = ${SEED_USER}) AS a`,
  ]);
  console.log('seeded', SEED_USER, JSON.stringify(n));
}
main().catch((e) => { console.error(e.message); process.exit(1); });

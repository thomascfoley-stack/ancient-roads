// VERIFY (do not assume) that Song of Solomon queries hit the no-content fallback.
//
// WHY THIS EXISTS: the owner ruled SoS an ACCEPTED LIMITATION for gated beta — a coverage hole,
// not a quality failure — ON CONDITION that the fallback is verified to actually fire rather than
// assumed. That condition matters: the failure mode nobody had checked is not "SoS returns
// nothing", it is "SoS returns something ELSE". retrieveCommentary is a vector search over the
// whole legal corpus; nothing about it is scoped to the asked-about book. If a SoS query pulls
// back semantically-adjacent material (Psalms, Revelation's bride imagery, a sermon quoting
// Canticles), then `retrieval.length === 0` is FALSE, teach.ts:111 never fires, and the pipeline
// composes an answer about Song of Solomon out of sources that are not about Song of Solomon.
// That would be a faithfulness problem wearing a coverage problem's clothes.
//
// So this prints, per query, what the REAL retrieval returns and which books those sources are
// actually about — and says plainly whether the fallback fired.
//
//   cd web && npx tsx --conditions=react-server --env-file=.env.local src/scripts/verify-sos-fallback.mts
//
// The --conditions=react-server flag is REQUIRED: this imports the real teacher path, which
// imports 'server-only'. That package's default export THROWS by design; its non-throwing entry
// sits behind the react-server condition. Without the flag you get "cannot be imported from a
// Client Component". (routing.ts is deliberately kept free of server-only so eval-heldout can
// import it without this flag — see its header.)
//
// Costs one embedding call per query (no compose calls — we stop at retrieval, which is where the
// fallback decision is made).

import { embedQuery } from '../lib/teacher/deepinfra.ts';
import { retrieveCommentary } from '../lib/teacher/retrieve.ts';

const QUERIES = [
  'Song of Solomon 2, I am the rose of Sharon and the lily of the valleys',
  'Song of Solomon 4, thou art all fair my love there is no spot in thee',
  'What do the commentators say about the Song of Songs?',
  'Canticles 8, love is strong as death, jealousy is cruel as the grave',
];

// A control: a book we KNOW is covered, so a "0 results" reading can be attributed to SoS
// coverage rather than to a broken script or a dead DB.
const CONTROL = 'John 10, I am the good shepherd and I lay down my life for the sheep';

function booksOf(chunks: Array<{ metadata: Record<string, unknown> }>): string[] {
  const out = new Set<string>();
  for (const c of chunks) {
    const m = c.metadata as { book?: string; reference?: string; sourceTitle?: string };
    out.add(m.book ?? m.reference ?? m.sourceTitle ?? 'unknown');
  }
  return [...out];
}

async function probe(label: string, q: string) {
  const vec = await embedQuery(q);
  const chunks = await retrieveCommentary(vec, 6, { query: q });
  const fired = chunks.length === 0;
  console.log(`\n[${label}] ${q}`);
  console.log(`  retrieval.length = ${chunks.length}  ->  fallback ${fired ? 'FIRES (kind:empty)' : 'does NOT fire'}`);
  if (!fired) {
    console.log(`  sources actually returned (what the answer would be composed FROM):`);
    for (const c of chunks.slice(0, 6)) {
      const m = c.metadata as { author?: string; sourceTitle?: string; reference?: string };
      console.log(`    - ${m.author ?? '?'} · ${m.sourceTitle ?? '?'} · ref=${m.reference ?? '?'} · score=${c.score.toFixed(3)}`);
    }
    console.log(`  distinct loci: ${booksOf(chunks).join(' | ')}`);
  }
  return { q, n: chunks.length, fired };
}

const results = [];
for (const q of QUERIES) results.push(await probe('SoS', q));
const control = await probe('CONTROL', CONTROL);

console.log('\n──────── SUMMARY ────────');
console.log(`control ("John 10") returned ${control.n} chunks — ${control.n > 0 ? 'pipeline is alive, so 0s below are real' : 'PIPELINE LOOKS DEAD; do not trust the SoS readings'}`);
const fired = results.filter((r) => r.fired).length;
console.log(`SoS queries where the no-content fallback FIRED: ${fired}/${results.length}`);
if (fired !== results.length) {
  console.log('\n⚠️  NOT all SoS queries fall back. For those, the pipeline composes an answer about');
  console.log('    Song of Solomon from sources that are not about Song of Solomon. That is a');
  console.log('    FAITHFULNESS issue, not merely a coverage hole, and the "accepted limitation"');
  console.log('    framing does not cover it. Report it as such.');
}

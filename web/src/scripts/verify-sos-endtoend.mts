// Second half of the SoS verification: retrieval does NOT fall back (verify-sos-fallback.mts
// showed 0/4), so what does the USER actually get? Runs the FULL teach() loop — compose + verify —
// and reports the outcome kind and what the answer is grounded in.
//
// Outcomes and what each would mean:
//   kind:'empty'    -> the no-content fallback fired (the ruling's assumption holds)
//   kind:'fallback' -> composed but the VERIFIER rejected it; user sees raw sources, not prose.
//                      Safe, but safe via the verifier, not via coverage detection.
//   kind:'composed' -> the user is served a composed answer about Song of Solomon built from
//                      sources that are not about Song of Solomon. That is the bad case.
//
//   cd web && npx tsx --env-file=.env.local src/scripts/verify-sos-endtoend.mts

import { teach } from '../lib/teacher/teach.ts';

const QUERIES = [
  'Song of Solomon 2, I am the rose of Sharon and the lily of the valleys',
  'Canticles 8, love is strong as death, jealousy is cruel as the grave',
];

for (const q of QUERIES) {
  console.log(`\n════════ ${q}`);
  try {
    const r = await teach(q);
    console.log(`  kind = ${r.kind}`);
    if (r.kind === 'empty') {
      console.log(`  reason = ${r.reason}`);
      console.log('  => NO-CONTENT FALLBACK FIRED (the accepted-limitation framing holds)');
    } else if (r.kind === 'fallback') {
      console.log(`  violations = ${r.violations.map((v) => v.code ?? JSON.stringify(v)).join(', ')}`);
      console.log(`  retrieval kept = ${r.retrieval.length} sources (user sees raw sources, not prose)`);
      console.log('  => VERIFIER caught it. Safe, but via the verifier, NOT via coverage detection.');
    } else {
      const resp = r.response as unknown as { answer?: string; summary?: string; voices?: unknown[]; passages?: unknown[] };
      const text = resp.summary ?? resp.answer ?? JSON.stringify(resp).slice(0, 400);
      console.log(`  voices = ${Array.isArray(resp.voices) ? resp.voices.length : '?'}, passages = ${Array.isArray(resp.passages) ? resp.passages.length : '?'}`);
      console.log(`  ANSWER SERVED TO USER:\n    ${String(text).replace(/\n/g, '\n    ').slice(0, 700)}`);
      console.log('  => COMPOSED. A Song of Solomon answer built from non-SoS sources reached the user.');
    }
  } catch (e) {
    console.log(`  THREW: ${(e as Error).message.slice(0, 200)}`);
  }
}

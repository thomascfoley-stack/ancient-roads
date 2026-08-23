/**
 * W-STRONGS verification — is the "truncated gloss" (WORKLOG 2026-08-21, G2316 named)
 * an adapter defect or an upstream-source property?
 *
 * READ-ONLY against the network; writes nothing. Fetches the same pinned upstream
 * files src/ingest/ingest-strongs.ts uses, parses them with the adapter's exact
 * technique, and diffs every entry against the served web/public/lexicon/*.json.
 * Then prints G2316 (raw source bytes vs served) and a seeded 20-entry sample.
 *
 *   node docs/evidence/swarm-2026-08-22/w-strongs/verify-strongs-glosses.mjs
 * (run from the repo/worktree root)
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';

const SOURCES = {
  greek: 'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js',
  hebrew: 'https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js',
};

// Exact copy of ingest-strongs.ts:parseJsDict / normalize.
function parseJsDict(js) {
  const start = js.indexOf('{');
  const end = js.lastIndexOf('}');
  const objLiteral = js.slice(start, end + 1);
  return Function(`"use strict"; return (${objLiteral});`)();
}
function normalize(raw) {
  return {
    lemma: raw.lemma ?? '',
    translit: raw.translit ?? raw.xlit ?? '',
    pron: raw.pron ?? raw.pronounce ?? '',
    def: (raw.strongs_def ?? '').trim(),
    derivation: (raw.derivation ?? '').trim(),
    kjv: (raw.kjv_def ?? '').trim(),
  };
}

function rawEntryBytes(js, key) {
  const m = js.match(new RegExp(`"${key}":\\s*\\{[^}]*\\}`));
  return m ? m[0] : `(key ${key} not found in source)`;
}

// Deterministic seeded PRNG (mulberry32) so the sample is reproducible.
function mulberry32(seed) {
  return () => {
    seed |= 0; seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

async function checkLang(lang, sampleSize) {
  const res = await fetch(SOURCES[lang]);
  const js = await res.text();
  const sha = createHash('sha256').update(js).digest('hex');
  const raw = parseJsDict(js);
  const upstream = {};
  for (const [k, v] of Object.entries(raw)) upstream[k] = normalize(v);

  const served = JSON.parse(readFileSync(`web/public/lexicon/${lang}.json`, 'utf8'));

  const upstreamKeys = Object.keys(upstream);
  const servedKeys = Object.keys(served);
  const onlyUpstream = upstreamKeys.filter((k) => !(k in served));
  const onlyServed = servedKeys.filter((k) => !(k in upstream));
  const mismatches = [];
  for (const k of upstreamKeys) {
    if (k in served && JSON.stringify(upstream[k]) !== JSON.stringify(served[k])) mismatches.push(k);
  }

  console.log(`\n=== ${lang} ===`);
  console.log(`fetched source sha256: ${sha}`);
  console.log(`upstream entries: ${upstreamKeys.length} · served entries: ${servedKeys.length}`);
  console.log(`keys only upstream: ${onlyUpstream.length} · only served: ${onlyServed.length} · field mismatches: ${mismatches.length}`);
  if (onlyUpstream.length) console.log('  only-upstream keys:', onlyUpstream.slice(0, 20).join(','));
  if (onlyServed.length) console.log('  only-served keys:', onlyServed.slice(0, 20).join(','));
  if (mismatches.length) console.log('  mismatch keys:', mismatches.slice(0, 20).join(','));

  if (lang === 'greek') {
    console.log('\n--- G2316 raw source bytes (openscriptures js) ---');
    console.log(rawEntryBytes(js, 'G2316'));
    console.log('--- G2316 served (web/public/lexicon/greek.json) ---');
    console.log(JSON.stringify(served.G2316, null, 1));
  }

  // Seeded random sample, compared field-by-field; raw source bytes printed for each.
  const rand = mulberry32(20260821);
  const pool = [...servedKeys];
  const sample = [];
  for (let i = 0; i < sampleSize && pool.length; i++) {
    sample.push(pool.splice(Math.floor(rand() * pool.length), 1)[0]);
  }
  sample.sort();
  let ok = 0;
  console.log(`\n--- seeded sample (seed 20260821, n=${sample.length}) ---`);
  for (const k of sample) {
    const match = JSON.stringify(upstream[k]) === JSON.stringify(served[k]);
    if (match) ok++;
    console.log(`${k} ${match ? 'MATCH' : 'MISMATCH'}  def=${JSON.stringify(served[k].def)}`);
  }
  console.log(`sample result: ${ok}/${sample.length} byte-identical to upstream`);
  return { mismatches: mismatches.length, sampleOk: ok, sampleN: sample.length };
}

const g = await checkLang('greek', 20);
const h = await checkLang('hebrew', 5);
const bad = g.mismatches + h.mismatches;
console.log(`\nVERDICT: ${bad === 0 ? 'adapter is LOSSLESS — truncation is upstream-source' : `${bad} mismatches — adapter defect present`}`);
process.exit(bad === 0 ? 0 : 1);

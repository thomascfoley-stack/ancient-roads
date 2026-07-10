// Pre-real-users validation for reference/pericope routing (READ-ONLY, no DB).
//
// The floor (reserved top slots) is the only tier that can HIJACK a query, so it
// is the precision gate. Injection is soft-boost (false-positive-safe) and is fine
// to fire broadly. Batteries:
//   - false-positives: idiomatic/topical queries mentioning reference-like terms.
//     PASS = floor stays empty (no hijack); injecting is harmless.
//   - genuine: real "about the passage" queries. PASS = floor fires (recall kept —
//     the corroboration gate must not suppress these).
//   - held-out numeric: refs NOT in the tuned eval — PASS = floor fires (the numeric
//     mechanism generalizes with zero tuning).
//   - held-out pericope: real pericopes NOT in the gazetteer — expected no-route
//     (honest coverage; grows reactively).
//   cd web && npx tsx src/scripts/probe-reference-routing.mts

import { resolveIntent } from '../bible/pericopes';

const FALSE_POSITIVES = [
  'ten commandments of leadership',
  'a good-samaritan gesture toward a stranger',
  'reading Romans, curious about grace',
  'the good shepherd insurance company reviews',
  'bread of life bakery near me',
  'he made a lazarus-like comeback',
  'the fiery furnace of political debate',
  'prodigal spending on luxury goods',
  'the armor of a knight in shining armor',
  'my genesis moment as an artist',
  'pentecost energy at the leadership rally',
  'walking on water with quiet confidence',
];

// Genuine "about the passage" queries — the corroboration gate must keep these.
const GENUINE = [
  'the beatitudes in the Sermon on the Mount',
  'the ten commandments given to Moses',
  'the parable of the prodigal son',
  'the whole armor of God, breastplate of righteousness',
  'the raising of Lazarus from the dead',
  'Pentecost and the tongues of fire',
  'the fiery furnace, Shadrach Meshach and Abednego',
  'what does the good shepherd passage in the gospel teach',
];

const HELD_OUT_NUMERIC = [
  'Habakkuk 3 the prophet prays',
  '2 Kings 5 Naaman healed of leprosy',
  'Philippians 2 the mind of Christ',
  'Nehemiah 8 the reading of the law',
  'Amos 5 let justice roll down like waters',
];

const HELD_OUT_PERICOPE = [
  'the woman at the well',
  'doubting Thomas',
  'Jonah and the whale',
  'the tower of Babel',
  'the wedding at Cana',
];

const fmt = (rs: { start: number; end: number }[]) =>
  rs.length === 0 ? '—' : rs.map((r) => `${Math.floor(r.start / 1e6)}:${Math.floor((r.start % 1e6) / 1000)}`).join(', ');

// mode: 'clean' → floor must be empty; 'floor' → floor must fire; 'none' → no-route.
function run(title: string, queries: string[], mode: 'clean' | 'floor' | 'none') {
  console.log(`\n${title}`);
  let ok = 0;
  for (const q of queries) {
    const { inject, floor } = resolveIntent(q);
    const pass = mode === 'clean' ? floor.length === 0 : mode === 'floor' ? floor.length > 0 : inject.length === 0 && floor.length === 0;
    if (pass) ok++;
    console.log(
      `  ${pass ? '✓' : '✗'} ${q.padEnd(52)} inject=${fmt(inject).padEnd(14)} floor=${fmt(floor)}`,
    );
  }
  console.log(`  ── ${ok}/${queries.length} pass`);
  return ok === queries.length;
}

const r1 = run('FALSE-POSITIVES (PASS = floor empty, no hijack):', FALSE_POSITIVES, 'clean');
const r2 = run('GENUINE (PASS = floor fires, recall kept):', GENUINE, 'floor');
const r3 = run('HELD-OUT NUMERIC (PASS = floor fires, generalizes untuned):', HELD_OUT_NUMERIC, 'floor');
const r4 = run('HELD-OUT PERICOPE (not in gazetteer — expected no-route):', HELD_OUT_PERICOPE, 'none');
console.log(`\nprecision ${r1 ? 'PASS' : 'FAIL'} · recall ${r2 ? 'PASS' : 'FAIL'} · generalization ${r3 ? 'PASS' : 'FAIL'} · coverage-honest ${r4 ? 'PASS' : 'FAIL'}`);

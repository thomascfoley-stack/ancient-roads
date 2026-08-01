#!/usr/bin/env -S npx tsx
/**
 * A3 — ADJUDICATE THE CENSUS. Offline. No database, no network, no credential.
 *
 *   npx tsx scripts/publish-flip-adjudicate.mts --census=<a2-serving-census.json>
 *
 * Reads the serving census A2.3 produced on production, applies the STOP rules, and emits the
 * slug list A4 will flip. Exit 0 = adjudicated, a flip list exists. Exit 1 = STOP. Exit 2 =
 * the input was refused.
 *
 * WHY THIS EXISTS AT ALL. The rules are already written and already red-proved, in
 * scripts/lib/publish-flip-census.mjs — deliberately split out so each STOP could be driven red
 * without a database. But the only thing that runs them, publish-flip-census.mts, REFUSES
 * PRODUCTION outright (`:24-26`, "not by a declaration the operator can satisfy"). So on the one
 * database where A3 actually happens, the codified rules could not run, and A3 would have been a
 * human eyeballing a table against rules that already exist as code — a verdict computed
 * separately from the report of that verdict, which is the second shape on this repo's own
 * failure-mode watchlist.
 *
 * This closes that without touching the prod refusal: A2 MEASURES on production (read-only,
 * through the instrument's guarded path), and this DECIDES offline from the artifact. The
 * database is never touched here.
 *
 * WHY tsx IS FINE HERE, unlike the writer: this runs on an operator's machine against a JSON
 * file, never on the production write path. It has to import the serving predicates from
 * web/src — and importing them is the whole point, because an adjudicator that re-typed
 * SERVED_PROSE_WORKS would decide admission against a population the product does not serve.
 * That is the same argument publish-flip-census.mts:18-22 makes for itself.
 */
import fs from 'node:fs';
import { LEGAL_CORPUS_FILTER, SERVED_PROSE_WORKS } from '../web/src/lib/teacher/routing';
import { admissionFindings, censusVerdict, STOP } from './lib/publish-flip-census.mjs';
import { endpointId } from './lib/target-guard.mjs';

const PROD_ENDPOINT = 'ep-odd-fog';
/** Slugs are the library's own identifiers. Anything else never reaches a flip list. */
const SLUG = /^[a-z0-9][a-z0-9-]*$/;

const args = process.argv.slice(2);
const val = (f: string) => args.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);
const censusPath = val('--census');
const outPath = val('--out') ?? 'docs/evidence/work-order-v2-stage2/flip-slugs.json';

function refuse(msg: string): never {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}

if (!censusPath) refuse('usage: publish-flip-adjudicate.mts --census=<serving-census.json> [--out=...]');

let census: Record<string, unknown>;
try {
  census = JSON.parse(fs.readFileSync(censusPath, 'utf8')) as Record<string, unknown>;
} catch (e) {
  refuse(`cannot read ${censusPath}: ${(e as Error).message}`);
}

// ── refuse the wrong artifact, loudly, rather than adjudicating it ─────────────────────────
// Each of these has a specific way of being silently wrong. A dev census would adjudicate a
// population that is not production's. A `published` cohort would mean the flip already
// happened and this is not A3 at all. An empty source list would make every rule below vacuous
// and exit 0 — a clean bill of health computed over nothing.
// Endpoint id, not substring. `.includes()` would accept ep-odd-fog.attacker.example, and every
// sibling in this toolchain uses target-guard (2026-08-02 audit).
// A census without its rollupDigest is untraceable to the instrument run that measured it.
// And a source list that disagrees with the count the census itself declares means rows were
// lost between measurement and adjudication: a non-empty list can still be a smaller
// population than production carries, and every dropped row is a work this script would
// silently never consider.
const host = String(census.host ?? '');
const id = endpointId(host);
// The DOMAIN must be pinned too, not just the first label. `endpointId` takes split('.')[0], so
// `ep-odd-fog.attacker.example` yields `ep-odd-fog` and would pass a label-only test — the same
// shape the audit found in the guard. A2 records a BARE endpoint id ("ep-odd-fog-atnykudm"), so
// accept exactly that, or a fully-qualified Neon host, and nothing in between.
const bareId = host.toLowerCase() === id;
const neonHost = /\.neon\.tech$/.test(host.toLowerCase());
if (id === null || !id.startsWith(PROD_ENDPOINT) || !(bareId || neonHost)) {
  refuse(
    `census host "${host || '(none)'}" is not a ${PROD_ENDPOINT}* Neon endpoint ` +
      '(expect a bare endpoint id or a *.neon.tech host). A3 adjudicates PRODUCTION.',
  );
}
if (census.cohort !== 'staged') {
  refuse(`census cohort is "${String(census.cohort)}", expected "staged". A published cohort means the flip already ran.`);
}
const rollupDigest = census.rollupDigest;
if (typeof rollupDigest !== 'string' || rollupDigest.length === 0) {
  refuse('census carries no rollupDigest. The verdict would not be traceable to the instrument run that measured it.');
}
const sources = census.sources;
if (!Array.isArray(sources) || sources.length === 0) {
  refuse('census carries no sources. Every rule below would be vacuous and this would exit 0.');
}
const expectedSourceCount = census.expectedSourceCount;
if (typeof expectedSourceCount !== 'number' || !Number.isInteger(expectedSourceCount) || expectedSourceCount <= 0) {
  refuse('census declares no expectedSourceCount. Without the measured total, a dropped row is undetectable here.');
}
if (sources.length !== expectedSourceCount) {
  refuse(`census carries ${sources.length} source(s) but declares expectedSourceCount=${expectedSourceCount}. Rows went missing between measurement and adjudication.`);
}

// ── admission, decided by the SHIPPED predicates ───────────────────────────────────────────
// SERVED_LANE_WORKS may not exist in every revision of routing.ts; fall back rather than crash,
// but record which sets were consulted so the verdict is auditable.
type LaneModule = { SERVED_LANE_WORKS?: readonly string[] };
const laneWorks: readonly string[] =
  ((await import('../web/src/lib/teacher/routing')) as LaneModule).SERVED_LANE_WORKS ?? [];
const admittedSet = new Set<string>([...SERVED_PROSE_WORKS, ...laneWorks]);

interface CensusSource {
  slug: string;
  status: string;
  source_type?: string;
  register?: string;
  admitted?: boolean;
  sections?: number;
}

const seenSlugs = new Set<string>();
const rows = (sources as CensusSource[]).map((s) => {
  if (typeof s?.slug !== 'string' || typeof s?.status !== 'string') {
    refuse(`a census row has no slug/status: ${JSON.stringify(s)}`);
  }
  if (!SLUG.test(s.slug)) refuse(`census row carries a value that is not a slug: ${JSON.stringify(s.slug)}`);
  // Trust the runner's `admitted` when it measured one (it had LEGAL_CORPUS_FILTER against a
  // live DB); otherwise decide it here from the same imported work list.
  // Duplicates would emit the same slug twice into the flip list and inflate the count.
  if (seenSlugs.has(s.slug)) refuse(`census lists ${s.slug} more than once`);
  seenSlugs.add(s.slug);
  const admitted = typeof s.admitted === 'boolean' ? s.admitted : admittedSet.has(s.slug);
  return { ...s, admitted };
});

const admission = admissionFindings(rows);
const verdict = censusVerdict({ admission, forbidden: undefined, voices: undefined, serving: undefined });

// ── the §1 table for PUBLISH_FLIP.md ───────────────────────────────────────────────────────
console.log(`publish-flip adjudication — census ${censusPath}`);
console.log(`host ${host} · cohort ${String(census.cohort)} · ${rows.length} source(s)\n`);
console.log('| slug | register | status | admitted | verdict |');
console.log('|---|---|---|---|---|');
for (const a of admission) {
  console.log(`| \`${a.slug}\` | ${a.register} | ${a.status} | ${a.admitted ? 'yes' : '**NO**'} | ${a.verdict} |`);
}

if (verdict.stop) {
  console.error(`\nSTOP — ${verdict.stops.length} finding(s):`);
  for (const s of verdict.stops) console.error(`  ${s}`);
  console.error('\nA published-but-not-admitted work is a STOP (MASTER.md A3). No flip list written.');
  process.exit(1);
}

// The flip list: ADMITTED works that are still staged. A work already published is not flipped
// again, and a not-admitted work is never flipped — it would be listed by the library and
// returned by nothing.
const flip = admission.filter((a) => a.admitted && a.status === 'staged').map((a) => a.slug).sort();

if (flip.length === 0) {
  console.error('\nSTOP: nothing to flip — no admitted work is staged. A4 would have no payload.');
  process.exit(1);
}

const payload = {
  adjudicatedAt: new Date().toISOString(),
  sourceReport: censusPath,
  host,
  cohort: census.cohort,
  rollupDigest,
  admittedBy: { servedProseWorks: SERVED_PROSE_WORKS.length, servedLaneWorks: laneWorks.length },
  legalCorpusFilterSha: LEGAL_CORPUS_FILTER.length, // a cheap drift signal, not a security claim
  slugs: flip,
};
fs.mkdirSync(outPath.replace(/\/[^/]+$/, ''), { recursive: true });
fs.writeFileSync(outPath, JSON.stringify(payload, null, 2));

console.log(`\nADJUDICATED — no STOP. ${flip.length} work(s) to flip:`);
for (const s of flip) console.log(`  ${s}`);
console.log(`\nwrote ${outPath}`);
console.log(`\nNext: PUBLISH_ALLOW=1 PUBLISH_EXPECT_HOST=${id} CUTOVER_DATABASE_URL=<owner url> \\`);
console.log(`        node scripts/publish-flip.mjs --slugs=${outPath}`);

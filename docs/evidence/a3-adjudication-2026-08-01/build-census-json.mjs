// THE BRIDGE — A2's as-run artifacts -> the census JSON publish-flip-adjudicate.mts consumes.
//
//   node docs/evidence/a3-adjudication-2026-08-01/build-census-json.mjs
//
// WHY THIS EXISTS. The adjudicator's input contract is JSON (host/cohort/sources); A2's order
// predates that contract and produced a rendered table. The WRONG fix is hand-typing the table
// into JSON — transcription is the drift this repo has now paid for eleven times, and it would
// put a human copy between the measurement and the verdict. So this parses the AS-RUN stdout
// artifacts, strictly: any table line that does not match the expected shape is a refusal, not
// a skip, because a silently dropped row would adjudicate a smaller census than was measured.
//
// THE ADMISSION DEFINITION, stated once, here, where it is applied:
//   admitted := (ADMITTED rows > 0) for the work.
// The reader-facing STOP (MASTER.md:37) is about a published work that retrieval can never
// return — a work with ZERO admitted rows. A work with a partial shortfall (calvin-crosswire,
// 5,088 of 5,090) serves; the shortfall is recorded as a note on the row, not a refusal. A2's
// own census already proved the fallback the adjudicator would otherwise use (slug membership
// in SERVED_PROSE_WORKS) admits NO production work — every admission runs through the author
// legs — so the boolean MUST be carried explicitly or all seven would silently read
// not-admitted and A3 would STOP on "nothing to flip" for the wrong reason.
//
// Inputs are pinned: the evidence directory as checked out from a2/prod-readonly-2026-08-01
// @ 4b31c0c. The output embeds the sha256 of both source artifacts so the adjudication is
// traceable to the exact bytes measured on production.
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const A2 = path.resolve(HERE, '../a2-prod-readonly-2026-08-01');
const OUT = path.join(HERE, 'a2-census.json');

const CENSUS_TXT = path.join(A2, 'census.txt');
const SERVING_LOG = path.join(A2, 'serving-census-stdout.log');
const INSTRUMENT = path.join(A2, 'instrument-staged.txt');

function die(msg) {
  console.error(`REFUSED: ${msg}`);
  process.exit(2);
}
const sha256 = (p) => crypto.createHash('sha256').update(fs.readFileSync(p)).digest('hex');
const read = (p) => {
  if (!fs.existsSync(p)) die(`missing artifact ${p}`);
  return fs.readFileSync(p, 'utf8');
};

// ── A2.1: slug, source_type, status, sections ──────────────────────────────────────────────
const censusText = read(CENSUS_TXT);
const censusSection = censusText.split(/=== A2\.1 SOURCES CENSUS[^\n]*\n/)[1]?.split('=== A2.1 TOTALS')[0];
if (!censusSection) die('census.txt does not contain the A2.1 table between its expected headings');

const CENSUS_ROW = /^\s{2}([a-z0-9-]+)\s+([a-z_]+)\s+([a-z]+)\s+([\d,]+)\s*$/;
const sources = new Map();
for (const line of censusSection.split('\n')) {
  if (!line.trim() || /^\s*slug\s/.test(line)) continue;
  const m = CENSUS_ROW.exec(line);
  if (!m) die(`unparseable A2.1 row (refusing rather than dropping it): ${JSON.stringify(line)}`);
  sources.set(m[1], {
    slug: m[1],
    source_type: m[2],
    status: m[3],
    sections: Number(m[4].replace(/,/g, '')),
  });
}
if (sources.size === 0) die('parsed zero A2.1 rows — the census would be vacuous');

// ── A2.3: the ADMITTED column, and the host actually reached ───────────────────────────────
const servingText = read(SERVING_LOG);
const host = /host reached:\s+(\S+)/.exec(servingText)?.[1];
if (!host) die('serving-census-stdout.log does not state the host reached');

const servingSection = servingText.split(/=== A2\.3 SERVING CENSUS[^\n]*\n/)[1]?.split('authors carried')[0];
if (!servingSection) die('serving log does not contain the per-source table');

const SERVING_ROW = /^\s{2}([a-z0-9-]+)\s+([a-z]+)\s+([\d,]+)\s+(yes|no)\s+(yes|no)\s+([\d,]+)\s+([\d,]+)\s*$/;
for (const line of servingSection.split('\n')) {
  if (!line.trim() || /^\s*slug\s/.test(line)) continue;
  const m = SERVING_ROW.exec(line);
  if (!m) die(`unparseable A2.3 row (refusing rather than dropping it): ${JSON.stringify(line)}`);
  const s = sources.get(m[1]);
  if (!s) die(`A2.3 names ${m[1]} which A2.1 does not — the censuses disagree about the population`);
  const admittedRows = Number(m[7].replace(/,/g, ''));
  const statusHere = m[2];
  if (statusHere !== s.status) die(`${m[1]}: status '${statusHere}' in A2.3 vs '${s.status}' in A2.1`);
  if (Number(m[3].replace(/,/g, '')) !== s.sections) die(`${m[1]}: sections disagree between A2.1 and A2.3`);
  s.admittedRows = admittedRows;
  s.admitted = admittedRows > 0;
  if (admittedRows > 0 && admittedRows < s.sections) {
    s.note = `partial: ${admittedRows} of ${s.sections} sections admitted`;
  }
}
for (const s of sources.values()) {
  if (typeof s.admitted !== 'boolean') die(`${s.slug} appears in A2.1 but not in the A2.3 table`);
}

// ── the instrument's digest, for traceability ──────────────────────────────────────────────
const rollupDigest = /rollupDigest:\s*([0-9a-f]+)/.exec(read(INSTRUMENT))?.[1] ?? null;

const payload = {
  builtFrom: {
    branch: 'a2/prod-readonly-2026-08-01',
    tip: '4b31c0c',
    artifacts: {
      'census.txt': sha256(CENSUS_TXT),
      'serving-census-stdout.log': sha256(SERVING_LOG),
      'instrument-staged.txt': sha256(INSTRUMENT),
    },
  },
  admissionDefinition: 'admitted := ADMITTED rows > 0 (a published work with zero admitted rows is the MASTER.md:37 STOP; a partial shortfall is a note, not a refusal)',
  host,
  cohort: 'staged',
  rollupDigest,
  sources: [...sources.values()].sort((a, b) => a.slug.localeCompare(b.slug)),
};

fs.writeFileSync(OUT, JSON.stringify(payload, null, 2));
console.log(`wrote ${OUT}`);
for (const s of payload.sources) {
  console.log(`  ${s.slug.padEnd(18)} ${s.status.padEnd(8)} sections=${String(s.sections).padStart(6)} admittedRows=${String(s.admittedRows).padStart(6)} admitted=${s.admitted}${s.note ? `  (${s.note})` : ''}`);
}

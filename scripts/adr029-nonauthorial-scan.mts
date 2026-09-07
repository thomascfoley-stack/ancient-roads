#!/usr/bin/env -S npx tsx
/**
 * ADR-029 Track A — non-authorial-matter instrument. Read-only, REPORTS ONLY.
 * Dev by default; prod only under the guarded mode below (SCAN_ALLOW_PROD=1 + exact --target).
 *
 *   export DATABASE_URL="$(cat ~/.neon_dev_owner_url)" NEON_BRANCH=dev
 *   npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat --mode=labelled
 *   npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-tiny-hat --mode=scan \
 *     [--slugs=docs/evidence/adr029-scan-2026-09-06/input-slugs.txt]
 *
 * PROD (added 2026-09-07, deep-audit C-3 remediation; owner go 2026-09-07, bylaw 7):
 *
 *   SCAN_ALLOW_PROD=1 DATABASE_URL="$(cat ~/.neon_prod_url)" \
 *   npx tsx scripts/adr029-nonauthorial-scan.mts --target=ep-odd-fog-atnykudm --mode=scan \
 *     --slugs=docs/evidence/adr029-scan-2026-09-07-prod/input-slugs.json
 *
 * Prod mode requires BOTH the explicit allow flag (same idiom as COVERAGE_ALLOW_PROD in
 * scripts/coverage-matrix.mts) AND --target naming the exact prod endpoint id (same
 * discipline as PUBLISH_EXPECT_HOST in scripts/publish-flip.mjs), plus an explicit
 * --slugs file — the frozen dev input is never a prod input. The scan itself is
 * unchanged: READ ONLY enforced by the database (BEGIN / SET TRANSACTION READ ONLY /
 * ROLLBACK), and it still REPORTS ONLY. Without the flag the prod refusal fires
 * pre-connection exactly as before; the dev guards are untouched.
 *
 * --slugs accepts the newline .txt format or a JSON file — either a bare array of
 * slug strings or an object with a "slugs" array (the corpus-copy batch-file shape).
 *
 * --mode=labelled runs the pre-registered labelled set (bar at the top of
 * docs/evidence/adr029-scan-2026-09-06/redproof.log): positives from the suppression
 * backups + live dev (origen-commentary) + the §298 fixture, kept negatives from live dev
 * + the fixture, and prints sensitivity/specificity with denominators.
 *
 * --mode=scan sweeps every work in the frozen slug file with sweepWorkMatter (head AND
 * tail, position-tagged) and prints one verdict line per work plus a JSON detail block.
 *
 * IT DOES NOT FIX ANYTHING. A detection is a claim to be read (ADR-029 recorded two
 * reported ranges that were WRONG); nothing here deletes, trims, or writes a row.
 */
import { readFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import pg from 'pg';
import {
  DETECTOR_VERSION,
  frontMatterVerdict,
  sweepWorkMatter,
} from './lib/front-matter-detector.mjs';
import { endpointId, hostOf, isProdHost } from './lib/target-guard.mjs';

const args = process.argv.slice(2);
const opt = (n: string): string | undefined => args.find((a) => a.startsWith(`--${n}=`))?.split('=')[1];
const mode = opt('mode') ?? 'labelled';
const declared = opt('target');
const slugsArg = opt('slugs');
const slugsPath = slugsArg ?? 'docs/evidence/adr029-scan-2026-09-06/input-slugs.txt';

// Narrowed to `string` HERE, at module scope: the throw guard does not carry into `main()` below
// (hoisted function declarations read the un-narrowed type), so `hostOf(url)` there was a
// `string | undefined` argument and the cutover-gate typecheck was red on the live branch —
// fixed independently on both sides of this merge; kept origin/main's shape.
const urlMaybe = process.env.DATABASE_URL;
if (!urlMaybe) throw new Error('DATABASE_URL is required (dev owner credential; prod only under SCAN_ALLOW_PROD=1 with the owner\'s go)');
const url: string = urlMaybe;
if (!declared) throw new Error('--target=<endpoint-id> is required');
if (isProdHost(url)) {
  // Prod path (C-3 remediation): explicit consent flag AND an exact declared endpoint,
  // AND an explicit slug file. The read-only transaction below is enforced and checked
  // in every mode — prod gets the same REPORTS ONLY scan, never a write.
  if (process.env.SCAN_ALLOW_PROD !== '1') {
    throw new Error(
      `REFUSING: ${hostOf(url)} is production. Re-run with SCAN_ALLOW_PROD=1 under the owner's ` +
      `go (bylaw 7), --target naming the exact prod endpoint id, and an explicit --slugs file. ` +
      `The scan stays READ ONLY.`,
    );
  }
  if (!slugsArg) {
    throw new Error('STOP: prod mode requires an explicit --slugs=<file> — the frozen dev input is not a prod input');
  }
} else if (process.env.NEON_BRANCH !== 'dev') {
  throw new Error('STOP: NEON_BRANCH must be "dev"');
}
if (endpointId(hostOf(url)) !== endpointId(declared)) {
  throw new Error(`STOP: ${hostOf(url)} is not the declared target '${declared}'`);
}

interface SecRow {
  ordinal: number;
  heading: string | null;
  body: string;
}
interface Finding {
  index: number;
  ordinal: number | null;
  position: string;
  kind: string;
  strength: string | null;
  evidence: string | null;
  reason?: string;
}

const report = (line = ''): void => console.log(line);

async function sectionsOf(client: pg.Client, slug: string): Promise<{ author: string; sections: SecRow[] }> {
  const { rows } = await client.query<{ author: string; ordinal: number; heading: string | null; body: string }>(
    `SELECT src.author, s.ordinal, s.heading, s.body
       FROM sections s JOIN sources src ON src.id = s.source_id
      WHERE src.slug = $1 ORDER BY s.ordinal`,
    [slug],
  );
  return { author: rows[0]?.author ?? '', sections: rows.map((r) => ({ ordinal: r.ordinal, heading: r.heading, body: r.body })) };
}

function span(findings: Finding[]): string {
  const ords = findings.map((f) => f.ordinal ?? f.index).sort((a, b) => a - b);
  return ords.length === 0 ? '—' : `§${ords[0]}${ords.length > 1 ? `…§${ords[ords.length - 1]}` : ''} (${findings.length} finding${findings.length === 1 ? '' : 's'})`;
}

async function main() {
  const client = new pg.Client({ connectionString: url, ssl: { rejectUnauthorized: false }, application_name: 'adr029-nonauthorial-scan' });
  await client.connect();
  try {
    await client.query('BEGIN');
    await client.query('SET TRANSACTION READ ONLY');
    if ((await client.query('SHOW transaction_read_only')).rows[0]?.transaction_read_only !== 'on') {
      throw new Error('STOP: read-only transaction not in force');
    }
    report(`detector version : ${DETECTOR_VERSION}`);
    report(`target           : ${hostOf(url)} (read-only txn; credentials not printed)`);

    if (mode === 'labelled') await labelled(client);
    else if (mode === 'scan') await scan(client);
    else throw new Error(`unknown --mode=${mode}`);
  } finally {
    await client.query('ROLLBACK').catch(() => {});
    await client.end();
  }
}

async function labelled(client: pg.Client) {
  const part1 = 'docs/evidence/part1/chrysostom-prolegomena-suppressed.jsonl';
  const part2 = 'docs/evidence/part2/nonauthorial-matter-suppressed.jsonl';
  const rows2 = readFileSync(part2, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const rows1 = readFileSync(part1, 'utf-8').trim().split('\n').map((l) => JSON.parse(l));
  const sp298 = readFileSync('docs/evidence/adr029-scan-2026-09-06/spurgeon-298-reconstructed.txt', 'utf-8').split('-----')[1]!.trim();

  let posDetected = 0;
  const posTotal = 11; // P1 chrysostom + P2 origen + P3 six index works + P4 three catalogue works
  const lines: string[] = [];
  const ok = (cond: boolean, label: string, detail: string) => {
    if (cond) posDetected++;
    lines.push(`  ${cond ? '✓' : '✗ MISS'} ${label.padEnd(46)} ${detail}`);
  };

  report('\n=== POSITIVES (bar: every documented positive WORK detected) ===');

  // P1 — chrysostom Prolegomena, from the suppression backup (NOT live; suppression applied).
  {
    const secs = rows1.map((r: any, i: number) => ({ ordinal: i + 1, heading: null, body: String(r.content ?? '') }));
    const sweep = sweepWorkMatter(secs, { author: 'John Chrysostom' });
    ok(sweep.findings.length > 0, 'P1 chrysostom-homilies §1–95 (backup)', `${sweep.findings.length}/${secs.length} rows fire; first: [${sweep.findings[0]?.kind}] ${JSON.stringify(sweep.findings[0]?.evidence?.slice(0, 60))}`);
  }

  // P2 — origen-commentary, LIVE in dev. The ADR's §1–~129 is approximate; findings are
  // reported against the bodies as read (genuine Origen begins at §130's banner).
  {
    const { author, sections } = await sectionsOf(client, 'origen-commentary');
    const sweep = sweepWorkMatter(sections, { author });
    const inSpan = sweep.findings.filter((f) => (f.ordinal ?? 0) <= 129);
    const beyond = sweep.findings.filter((f) => (f.ordinal ?? 0) > 129);
    ok(inSpan.length > 0, 'P2 origen-commentary §1–~129 (LIVE)', `${inSpan.length} finding(s) ≤§129 ${span(inSpan)}; ${beyond.length} beyond §129 ${span(beyond)} — beyond-span findings are listed, not hidden`);
    for (const f of sweep.findings.slice(0, 8)) {
      lines.push(`      §${f.ordinal} [${f.kind}/${f.position}] ${JSON.stringify(f.evidence?.slice(0, 70))}${f.reason ? ` — ${f.reason}` : ''}`);
    }
  }

  // P3 — word/phrase indexes, from the suppression backup (NOT live).
  const INDEX_WORKS: Array<[string, number]> = [
    ['schaff-creeds', 585], ['hodge-systematic', 283], ['owen-works', 41],
    ['watson-works', 17], ['maclaren-expositions', 2], ['edwards-works', 1],
  ];
  for (const [slug, expectN] of INDEX_WORKS) {
    const rows = rows2.filter((r: any) => r.slug === slug && r.target === 'word index');
    if (rows.length !== expectN) throw new Error(`STOP: backup holds ${rows.length} ${slug} index rows, expected ${expectN} — the labelled source moved`);
    const hits = rows.filter((r: any) => frontMatterVerdict({ heading: r.heading, body: r.body }).apparatus).length;
    ok(hits > 0, `P3 ${slug} word index (backup)`, `${hits}/${rows.length} rows fire`);
  }

  // P4 — publisher catalogues, from the suppression backup (NOT live). Every row was
  // body-verified pure catalogue/ad material, so the per-row bar is 12/12.
  const CAT: Array<[string, number[]]> = [
    ['tennyson-in-memoriam', [1, 2, 3, 4, 5]],
    ['traherne-poems', [413, 414, 415, 416, 417]],
    ['spurgeon-talks-to-farmers', [299, 300]],
  ];
  const CAT_AUTHOR: Record<string, string> = {
    'tennyson-in-memoriam': 'Alfred Tennyson',
    'traherne-poems': 'Thomas Traherne',
    'spurgeon-talks-to-farmers': 'Charles Haddon Spurgeon',
  };
  for (const [slug, ords] of CAT) {
    const secs = ords.map((o) => {
      const r = rows2.find((x: any) => x.slug === slug && x.ordinal === o);
      if (!r) throw new Error(`STOP: backup lacks ${slug} §${o} — the labelled source moved`);
      return { ordinal: r.ordinal, heading: r.heading, body: r.body };
    });
    const sweep = sweepWorkMatter(secs, { author: CAT_AUTHOR[slug] });
    const hitRows = new Set(sweep.findings.map((f) => f.ordinal));
    ok(hitRows.size > 0, `P4 ${slug} catalogue (backup)`, `${hitRows.size}/${ords.length} rows fire${hitRows.size < ords.length ? ` — unfired: ${ords.filter((o) => !hitRows.has(o)).join(',')}` : ''}`);
  }

  report(lines.join('\n'));

  report('\n=== KEPT NEGATIVES (bar: zero flagged — one flag and the detector does not ship) ===');
  let negClean = 0;
  const negTotal = 3;
  const nok = (cond: boolean, label: string, detail: string) => {
    if (cond) negClean++;
    report(`  ${cond ? '✓ clean' : '✗✗ FLAGGED'} ${label.padEnd(52)} ${detail}`);
  };
  {
    const { rows } = await client.query<SecRow>(
      `SELECT s.ordinal, s.heading, s.body FROM sections s JOIN sources src ON src.id=s.source_id
        WHERE src.slug='schaff-creeds' AND s.heading ~* 'Comparative Table of the Ante-Nicene' ORDER BY s.ordinal`,
    );
    const sweep = sweepWorkMatter(rows, { author: 'Philip Schaff' });
    nok(sweep.findings.length === 0, `K1 schaff-creeds comparative table (${rows.length}/7 rows)`, sweep.findings.length === 0 ? '0 findings' : JSON.stringify(sweep.findings[0]));
    if (rows.length !== 7) throw new Error(`STOP: expected 7 comparative-table rows, got ${rows.length}`);
  }
  {
    const { rows } = await client.query<SecRow>(
      `SELECT s.ordinal, s.heading, s.body FROM sections s JOIN sources src ON src.id=s.source_id
        WHERE src.slug='calvin-institutes' AND s.heading ~* 'General Index of Chapters' ORDER BY s.ordinal`,
    );
    const sweep = sweepWorkMatter(rows, { author: 'John Calvin' });
    nok(sweep.findings.length === 0, `K2 calvin-institutes index of chapters (${rows.length}/6 rows)`, sweep.findings.length === 0 ? '0 findings' : JSON.stringify(sweep.findings[0]));
    if (rows.length !== 6) throw new Error(`STOP: expected 6 general-index rows, got ${rows.length}`);
  }
  {
    const sweep = sweepWorkMatter(
      [{ ordinal: 298, heading: 'WHEAT IN THE BARN — MATTHEW 13:30 (13/15)', body: sp298 }],
      { author: 'Charles Haddon Spurgeon' },
    );
    nok(sweep.findings.length === 0, 'K3 spurgeon-talks-to-farmers §298 mixed (fixture)', sweep.findings.length === 0 ? '0 findings' : JSON.stringify(sweep.findings[0]));
  }

  report('\n=== LABELLED-SET VERDICT ===');
  report(`  positives detected : ${posDetected}/${posTotal} works (sensitivity, denominator ${posTotal})`);
  report(`  kept negatives clean: ${negClean}/${negTotal} (specificity, denominator ${negTotal})`);
  const pass = posDetected === posTotal && negClean === negTotal;
  report(pass ? '  ✓ BAR MET' : '  ✗ BAR FAILED — the detector does not ship in this state');
  if (!pass) process.exitCode = 1;
}

/** Newline .txt input, or JSON: a bare slug array, or { slugs: [...] } (batch-file shape). */
function loadSlugs(path: string): string[] {
  const raw = readFileSync(path, 'utf-8').trim();
  if (raw.startsWith('[') || raw.startsWith('{')) {
    const parsed: unknown = JSON.parse(raw);
    const arr = Array.isArray(parsed) ? parsed : (parsed as { slugs?: unknown }).slugs;
    if (!Array.isArray(arr) || arr.length === 0 || !arr.every((s) => typeof s === 'string' && /^[a-z0-9][a-z0-9-]*$/.test(s))) {
      throw new Error(`STOP: ${path} is JSON but carries no non-empty string slug array (expected [...] or { "slugs": [...] })`);
    }
    return arr as string[];
  }
  return raw.split('\n').filter(Boolean);
}

async function scan(client: pg.Client) {
  const slugs = loadSlugs(slugsPath);
  const slugFileSha = createHash('sha256').update(readFileSync(slugsPath)).digest('hex');
  report(`slug file        : ${slugsPath} (${slugs.length} works, sha256 ${slugFileSha})`);
  report('');
  const detail: Array<Record<string, unknown>> = [];
  let pass = 0;
  let fail = 0;
  for (const slug of slugs) {
    const { author, sections } = await sectionsOf(client, slug);
    if (sections.length === 0) {
      report(`EMPTY  ${slug}  — 0 sections (staged shell; nothing to sweep)`);
      detail.push({ slug, verdict: 'EMPTY', author, scanned: 0, findings: [] });
      continue;
    }
    const sweep = sweepWorkMatter(sections, { author });
    const strong = sweep.findings.filter((f) => f.strength === 'strong');
    const verdict = strong.length > 0 ? 'FAIL' : 'PASS';
    if (verdict === 'FAIL') fail++;
    else pass++;
    report(
      `${verdict}  ${slug.padEnd(36)} ${String(sections.length).padStart(6)} sections  ${span(strong).padEnd(22)} ${
        Object.entries(sweep.byKind).map(([k, n]) => `${k}=${n}`).join(', ') || 'no findings'
      }`,
    );
    detail.push({
      slug, verdict, author, scanned: sections.length,
      findings: sweep.findings.map((f) => ({
        ordinal: f.ordinal, position: f.position, kind: f.kind, strength: f.strength,
        evidence: f.evidence, reason: f.reason ?? null,
      })),
    });
  }
  report('');
  report(`=== SCAN VERDICT — ${slugs.length} works: ${pass} PASS, ${fail} FAIL, ${detail.filter((d) => d.verdict === 'EMPTY').length} EMPTY ===`);
  report('\nJSON_DETAIL_BEGIN');
  report(JSON.stringify({ detectorVersion: DETECTOR_VERSION, slugFile: slugsPath, slugFileSha256: slugFileSha, works: detail }, null, 1));
  report('JSON_DETAIL_END');
}

await main();

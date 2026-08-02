#!/usr/bin/env -S npx tsx
/**
 * ARCHIVE THE RAW SOURCES — so the corpus stops being rebuildable only by re-scraping the internet.
 *
 *   npx tsx scripts/archive-sources.mts                    # survey only, no network (DEFAULT)
 *   npx tsx scripts/archive-sources.mts --fetch            # actually download
 *   npx tsx scripts/archive-sources.mts --fetch --slug=olney-hymns
 *
 * WHY. Measured 2026-08-02: `data/raw` holds 21MB and one thing, `sword/Barnes`. Every other
 * downloaded source is gone, `data/` is gitignored so none of it was ever backed up, and the
 * curated corpus therefore exists in exactly ONE place — the dev Neon branch. Losing that branch
 * means re-downloading 33 works from 7 external hosts and losing two months of curation with it.
 * This tool makes the inputs ours.
 *
 * DRY-RUN IS THE DEFAULT, and the survey is the more useful half on first contact: it prints
 * exactly which works are recoverable and which are not, without touching the network.
 *
 * THE CHECKSUM MANIFEST IS THE DURABLE ARTIFACT, not the bytes. Bytes go to `data/raw/archive/`
 * (gitignored — this is 100s of MB and does not belong in git); `docs/evidence/source-archive/
 * manifest.json` is committed and records, per file, the URL it came from, its sha256, its size
 * and when it was fetched. That file is what makes a future rebuild provable rather than hopeful.
 *
 * FAIL CLOSED, at acquisition. A forbidden-aggregator provenance or a non-permitted licence is
 * REFUSED here, not merely downstream. The predicates are imported from the modules that already
 * own them (`forbidden-provenance.mjs`, `allowed-licenses.mjs`) and never re-typed — a second copy
 * of a legal rule is this repo's most-repeated defect.
 */
import { createHash } from 'node:crypto';
import { mkdirSync, readFileSync, writeFileSync, existsSync, statSync } from 'node:fs';
import path from 'node:path';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { artifactSourcesFor } from '../src/ingest/source-artifact-urls.mjs';

const REPO = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const MANIFEST_IN = path.join(REPO, 'ingest/sources.config.json');
const ARCHIVE_ROOT = path.join(REPO, 'data/raw/archive');
const RECORD_OUT = path.join(REPO, 'docs/evidence/source-archive/manifest.json');

const args = process.argv.slice(2);
const FETCH = args.includes('--fetch');
const ONLY = args.find((a) => a.startsWith('--slug='))?.slice('--slug='.length);
/** Politeness: one request per host at a time, spaced. These are donated public archives. */
const HOST_DELAY_MS = 1500;

interface FileRecord {
  slug: string;
  artifact: string;
  url: string;
  sha256: string;
  bytes: number;
  fetchedAt: string;
  contentType?: string;
}
interface Skipped {
  slug: string;
  kind: string;
  reason: string;
}

const sha256 = (buf: Buffer) => createHash('sha256').update(buf).digest('hex');
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// Prior run's records, keyed slug/artifact — this is what makes the tool resumable and, more
// importantly, what lets it verify rather than re-download: a file already on disk whose bytes
// still hash to the recorded value is archived, and is skipped without a request.
const prior: Record<string, FileRecord> = existsSync(RECORD_OUT)
  ? Object.fromEntries(
      ((JSON.parse(readFileSync(RECORD_OUT, 'utf8')) as { files?: FileRecord[] }).files ?? []).map((f) => [
        `${f.slug}/${f.artifact}`,
        f,
      ]),
    )
  : {};

const entries = Object.values(JSON.parse(readFileSync(MANIFEST_IN, 'utf8')) as Record<string, Record<string, unknown>>)
  .filter((e) => typeof e.slug === 'string')
  .filter((e) => !ONLY || e.slug === ONLY);

const files: FileRecord[] = [];
const refused: Skipped[] = [];
const unrecoverable: Skipped[] = [];
const failed: Skipped[] = [];
let verified = 0;
let downloaded = 0;
const lastHostHit = new Map<string, number>();

async function politeFetch(url: string): Promise<{ buf: Buffer; contentType?: string }> {
  const host = new URL(url).hostname;
  const since = Date.now() - (lastHostHit.get(host) ?? 0);
  if (since < HOST_DELAY_MS) await sleep(HOST_DELAY_MS - since);
  lastHostHit.set(host, Date.now());
  const res = await fetch(url, {
    signal: AbortSignal.timeout(180_000),
    headers: { 'user-agent': 'ancient-paths-archiver/1.0 (corpus preservation; contact via repo)' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return { buf: Buffer.from(await res.arrayBuffer()), contentType: res.headers.get('content-type') ?? undefined };
}

for (const entry of entries) {
  const slug = entry.slug as string;
  const prov = (entry.provenance ?? {}) as Record<string, unknown>;

  // ── the legal gates, at acquisition time ────────────────────────────────────────────────
  const domain = forbiddenProvenanceDomain(String(prov.url ?? ''));
  if (domain) {
    refused.push({ slug, kind: 'forbidden-provenance', reason: `provenance is ${domain} (ADR-008) — never re-fetched` });
    continue;
  }
  if (!isAllowedLicense(entry.license as string)) {
    refused.push({ slug, kind: 'licence', reason: `licence "${String(entry.license)}" is not in the permitted set` });
    continue;
  }

  const sources = artifactSourcesFor(entry);
  if (!sources.ok) {
    unrecoverable.push({ slug, kind: sources.kind, reason: sources.reason });
    continue;
  }

  for (const art of sources.artifacts) {
    const key = `${slug}/${art.name}`;
    const dest = path.join(ARCHIVE_ROOT, slug, art.name);

    // Already archived? Verify the BYTES, not the filename. A truncated or replaced file must not
    // read as archived just because something exists at the path.
    const known = prior[key];
    if (known && existsSync(dest) && statSync(dest).size === known.bytes && sha256(readFileSync(dest)) === known.sha256) {
      files.push(known);
      verified++;
      continue;
    }

    if (!FETCH) {
      console.log(`  would fetch  ${key.padEnd(52)} ${art.urls[0]}`);
      continue;
    }

    let done = false;
    let lastErr = '';
    for (const url of art.urls) {
      try {
        const { buf, contentType } = await politeFetch(url);
        mkdirSync(path.dirname(dest), { recursive: true });
        writeFileSync(dest, buf);
        const rec: FileRecord = {
          slug,
          artifact: art.name,
          url,
          sha256: sha256(buf),
          bytes: buf.length,
          fetchedAt: new Date().toISOString(),
          contentType,
        };
        files.push(rec);
        downloaded++;
        console.log(`  ✓ ${String(buf.length).padStart(10)} bytes  ${key}`);
        done = true;
        break;
      } catch (e) {
        lastErr = `${url}: ${(e as Error).message}`;
      }
    }
    // A failure is recorded and the run CONTINUES. 41 fetches across 7 donated hosts will have
    // transient failures, and aborting the whole archive on one 503 is how this never gets done.
    if (!done) {
      failed.push({ slug, kind: 'fetch', reason: lastErr });
      console.log(`  ✗ FAILED       ${key} — ${lastErr}`);
    }
  }
}

// ── the report ──────────────────────────────────────────────────────────────────────────────
console.log(`\n${'='.repeat(78)}`);
console.log(`SOURCE ARCHIVE — ${FETCH ? 'FETCH' : 'SURVEY (no network; pass --fetch to download)'}`);
console.log('='.repeat(78));
console.log(`works considered:        ${entries.length}`);
console.log(`files archived+verified: ${verified}`);
console.log(`files downloaded now:    ${downloaded}`);
console.log(`fetch failures:          ${failed.length}`);
console.log(`refused (legal gates):   ${refused.length}`);
console.log(`UNRECOVERABLE:           ${unrecoverable.length}`);

const say = (title: string, rows: Skipped[]) => {
  if (rows.length === 0) return;
  console.log(`\n${title}`);
  for (const r of rows) console.log(`  ${r.slug.padEnd(28)} [${r.kind}] ${r.reason}`);
};
say('REFUSED — these must never be re-fetched:', refused);
say('FETCH FAILURES — re-run to retry:', failed);
say('UNRECOVERABLE — no derivable URL; these need a human to re-establish the source:', unrecoverable);

if (FETCH) {
  mkdirSync(path.dirname(RECORD_OUT), { recursive: true });
  writeFileSync(
    RECORD_OUT,
    `${JSON.stringify(
      {
        _: 'Checksums for the archived raw sources. The BYTES live in data/raw/archive (gitignored); THIS file is the durable artifact and is committed. A rebuild is provable only against these hashes.',
        generatedBy: 'scripts/archive-sources.mts',
        // No wall-clock summary field: it would churn this file on every run and say nothing the
        // per-file fetchedAt does not already say.
        files: files.sort((a, b) => `${a.slug}/${a.artifact}`.localeCompare(`${b.slug}/${b.artifact}`)),
        unrecoverable: unrecoverable.sort((a, b) => a.slug.localeCompare(b.slug)),
        refused: refused.sort((a, b) => a.slug.localeCompare(b.slug)),
      },
      null,
      2,
    )}\n`,
  );
  console.log(`\nwrote ${path.relative(REPO, RECORD_OUT)} (${files.length} file record(s))`);
}

// A fetch failure is transient and re-runnable; an UNRECOVERABLE work is a standing gap in the
// project's ability to rebuild itself, and must not exit 0 quietly.
process.exitCode = unrecoverable.length > 0 ? 1 : 0;

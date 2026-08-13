// Re-sourcing pipeline step 1 — fetch a named CrossWire SWORD module over HTTP,
// VERIFY its .conf DistributionLicense BEFORE decoding anything (the geneva-notes
// lesson: verify before ingest, not after), then decode to per-verse JSONL by
// REUSING the repo's zVerse decoder (src/ingest/sword-zverse.ts) — no second
// SWORD path.
//
//   npx tsx scripts/resourcing/fetch-crosswire.mts --module=Barnes --author='Albert Barnes' \
//     [--testament=ot|nt|all] [--out=data/raw/sword/barnes.jsonl] [--dir=data/raw/sword]
//
// Output JSONL rows: { author, verseId, verseEnd, content } (verseId = book*1e6 +
// ch*1e3 + verse, the corpus-wide scheme). FAILS CLOSED: exits non-zero without
// decoding if DistributionLicense is absent or not in the allowed set
// (src/ingest/allowed-licenses.mjs). Prints the license fields it verified —
// capture stdout to the evidence log.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { isAllowedLicense } from '../../src/ingest/license-manifest.js';
import { decodeTestament, loadKjvCanon, verseLabelCheck } from '../../src/ingest/sword-zverse.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const RAWZIP_BASE = 'https://crosswire.org/ftpmirror/pub/sword/packages/rawzip';

interface ConfFields { [k: string]: string }

function parseConf(conf: string): ConfFields {
  const out: ConfFields = {};
  for (const line of conf.split(/\r?\n/)) {
    const m = line.match(/^([A-Za-z0-9_]+)=(.*)$/);
    if (m) out[m[1]!] = m[2]!.trim();
  }
  return out;
}

async function main() {
  const moduleName = arg('--module');
  const author = arg('--author');
  const testament = (arg('--testament') ?? 'all') as 'ot' | 'nt' | 'all';
  const rootDir = arg('--dir') ?? 'data/raw/sword';
  const outPath = arg('--out') ?? path.join(rootDir, `${moduleName?.toLowerCase()}.jsonl`);
  if (!moduleName || !author) {
    throw new Error("usage: fetch-crosswire.mts --module=<Name> --author='Name' [--testament=ot|nt|all] [--out=<f.jsonl>] [--dir=data/raw/sword]");
  }
  if (!/^[A-Za-z0-9]+$/.test(moduleName)) throw new Error(`module name must be alnum (path safety): ${moduleName}`);

  // ── 1. Fetch the rawzip over HTTP ──
  const zipUrl = `${RAWZIP_BASE}/${moduleName}.zip`;
  console.log(`fetch: ${zipUrl}`);
  const res = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
  if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} for ${zipUrl}`);
  const zipBuf = Buffer.from(await res.arrayBuffer());
  console.log(`fetched ${zipBuf.length} bytes`);

  // ── 2. Extract (system unzip; entries come from CrossWire's own package) ──
  const moduleDir = path.join(rootDir, moduleName);
  const stage = mkdtempSync(path.join(tmpdir(), 'sword-'));
  try {
    const zipPath = path.join(stage, 'module.zip');
    writeFileSync(zipPath, zipBuf);
    execFileSync('unzip', ['-o', '-q', zipPath, '-d', stage]);
    const confName = readdirSync(path.join(stage, 'mods.d')).find((f) => f.endsWith('.conf'));
    if (!confName) throw new Error('no mods.d/*.conf in package — not a SWORD module zip');

    // ── 3. LICENSE GATE — verify and PRINT before any decode (geneva lesson) ──
    const conf = parseConf(readFileSync(path.join(stage, 'mods.d', confName), 'utf8'));
    console.log(`conf: [${confName.replace(/\.conf$/, '')}] ModDrv=${conf.ModDrv} CompressType=${conf.CompressType} SourceType=${conf.SourceType}`);
    console.log(`conf: Description=${conf.Description ?? '(absent)'}`);
    console.log(`conf: DistributionLicense=${conf.DistributionLicense ?? '(ABSENT)'}`);
    console.log(`conf: Version=${conf.Version ?? '?'} SwordVersionDate=${conf.SwordVersionDate ?? '?'}`);
    if (!isAllowedLicense(conf.DistributionLicense ?? '')) {
      console.error(`FAIL CLOSED: DistributionLicense="${conf.DistributionLicense ?? '(absent)'}" is not in the allowed set — NOT decoding, NOT ingesting.`);
      process.exit(1);
    }
    console.log('license gate: PASS (allowed set: Public Domain | CC BY | CC BY-SA)');

    // ── 4. Testament coverage — report loudly; a missing testament is a fact
    //        the batch plan needs (Barnes is NT-only), not something to paper over.
    const dataRel = (conf.DataPath ?? '').replace(/^\.\//, '');
    const dataDir = path.join(stage, dataRel);
    const present = (['ot', 'nt'] as const).filter((t) =>
      existsSync(path.join(dataDir, `${t}.bzv`)) || existsSync(path.join(dataDir, `${t}.czv`)));
    console.log(`testament coverage: ${present.length ? present.join(', ') : 'NONE'}`);
    if (testament === 'all' && present.length < 2) {
      console.log(`⚠ module does NOT span both testaments (has: ${present.join(', ') || 'none'}) — sections outside it will be NO-SOURCE`);
    }

    // ── 5. Decode via the repo's zVerse reader (it re-verifies the license at
    //        its own mouth — defense in depth, same gate twice) ──
    rmSync(moduleDir, { recursive: true, force: true });
    mkdirSync(path.dirname(moduleDir), { recursive: true });
    execFileSync('mv', [stage, moduleDir]);
    const canon = loadKjvCanon(arg('--canon') ?? 'web/public/bible/kjv');
    const entries = [];
    for (const t of testament === 'all' ? present : [testament]) {
      entries.push(...decodeTestament(moduleDir, t, author, canon));
    }
    const books = new Set(entries.map((e) => Math.floor(e.verseId / 1e6)));
    mkdirSync(path.dirname(outPath), { recursive: true });
    writeFileSync(outPath, entries.map((e) => JSON.stringify(e)).join('\n') + (entries.length ? '\n' : ''));
    console.log(`decoded: ${entries.length} per-verse entries across ${books.size} books → ${outPath}`);
    const { labeled, agree } = verseLabelCheck(entries);
    if (labeled > 0) {
      console.log(`verse-label alignment: ${agree}/${labeled} agree${agree === labeled ? ' — bulletproof' : ' ⚠ INVESTIGATE'}`);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true }); // no-op after the mv
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });

// CrossWire BIBLE-module (zText) fetch + decode to the static reader corpus —
// the Bible-text fork of scripts/resourcing/fetch-crosswire.mts (which decodes
// zCom COMMENTARY modules to JSONL). Same shape, same gates:
//
//   npx tsx scripts/resourcing/fetch-crosswire-bible.mts --module=Weymouth --id=weymouth \
//     [--dir=<local module dir, skip fetch>] [--out=web/public/bible]
//
// - LICENSE GATE FIRST (the geneva-notes lesson): the .conf DistributionLicense
//   is printed and checked against the allowed set BEFORE any decode; absent or
//   outside the set fails closed.
// - VERSIFICATION GATE: only KJV-versified modules decode (absent field = KJV
//   default). Vulg/MT/LXX modules refuse — mapping another canon is a separate,
//   reviewable artifact, not a silent decode choice.
// - Output: per-chapter files web/public/bible/<id>/<slug>/<ch>.json
//   ({ book, chapter, translation, verses: [{verse, text}] }), the regeneration
//   source consolidated by src/ingest/consolidate-bibles.ts.
// - Slot-count check against the repo's own KJV canon (loadKjvCanon) — a module
//   whose indexes don't match KJV v11n arithmetic fails loudly, never silently
//   mis-keys verses.
// - Linked verses (consecutive slots sharing block:start:size, i.e. merged in
//   translation) emit their text once; the rest of the run gets "" so every
//   canonical verse keeps a slot.
//
// Reuses the repo's zVerse index reader semantics (sword-zverse.ts) rather than
// inventing a second SWORD path.

import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { inflateSync } from 'node:zlib';
import { isAllowedLicense } from '../../src/ingest/license-manifest.js';
import { loadKjvCanon } from '../../src/ingest/sword-zverse.js';
import { BOOKS } from '../../src/bible/books.js';

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

interface Slot { block: number; start: number; size: number }

function readSlots(bzv: Buffer): Slot[] {
  const out: Slot[] = [];
  for (let i = 0; i + 10 <= bzv.length; i += 10) {
    out.push({ block: bzv.readUInt32LE(i), start: bzv.readUInt32LE(i + 4), size: bzv.readUInt16LE(i + 8) });
  }
  return out;
}

// GBF/OSIS → plain text. Footnote and cross-reference SPANS are dropped (their
// content is translator apparatus, not the verse); every other tag keeps its
// inner text (<divineName>, <transChange>, <hi>, <q>, <w>, <seg>, …).
function stripMarkup(raw: string): string {
  let s = raw;
  s = s.replace(/<RF>[\s\S]*?<Rf>/g, ' '); // GBF footnotes
  s = s.replace(/<note\b[^>]*>[\s\S]*?<\/note>/gi, ' '); // OSIS notes
  s = s.replace(/<reference\b[^>]*>[\s\S]*?<\/reference>/gi, ' '); // OSIS cross-refs
  s = s.replace(/<title\b[^>]*>[\s\S]*?<\/title>/gi, ' '); // OSIS section headings
  s = s.replace(/<[^>]+>/g, ' ');
  s = s.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&amp;/g, '&');
  return s.replace(/\s+/g, ' ').trim();
}

async function main() {
  const moduleName = arg('--module');
  const id = arg('--id');
  const outRoot = arg('--out') ?? 'web/public/bible';
  let moduleDir = arg('--dir');
  if (!moduleName || !id) {
    throw new Error('usage: fetch-crosswire-bible.mts --module=<Name> --id=<translation-id> [--dir=<module dir>] [--out=web/public/bible]');
  }
  if (!/^[A-Za-z0-9]+$/.test(moduleName) || !/^[a-z0-9]+$/.test(id)) {
    throw new Error('module/id must be alnum (path safety)');
  }

  const stage = mkdtempSync(path.join(tmpdir(), 'sword-bible-'));
  try {
    if (!moduleDir) {
      const zipUrl = `${RAWZIP_BASE}/${moduleName}.zip`;
      console.log(`fetch: ${zipUrl}`);
      const res = await fetch(zipUrl, { signal: AbortSignal.timeout(120_000) });
      if (!res.ok) throw new Error(`fetch failed: HTTP ${res.status} for ${zipUrl}`);
      const zipPath = path.join(stage, 'module.zip');
      writeFileSync(zipPath, Buffer.from(await res.arrayBuffer()));
      execFileSync('unzip', ['-o', '-q', zipPath, '-d', stage]);
      moduleDir = stage;
    }

    // ── LICENSE GATE — verify and PRINT before any decode (geneva lesson) ──
    const confName = readdirSync(path.join(moduleDir, 'mods.d')).find((f) => f.endsWith('.conf'));
    if (!confName) throw new Error('no mods.d/*.conf — not a SWORD module dir');
    const conf = parseConf(readFileSync(path.join(moduleDir, 'mods.d', confName), 'utf8'));
    console.log(`conf: [${confName.replace(/\.conf$/, '')}] ModDrv=${conf.ModDrv} CompressType=${conf.CompressType} SourceType=${conf.SourceType ?? '?'} BlockType=${conf.BlockType ?? '?'}`);
    console.log(`conf: Description=${conf.Description ?? '(absent)'}`);
    console.log(`conf: About=${(conf.About ?? '(absent)').slice(0, 200)}`);
    console.log(`conf: DistributionLicense=${conf.DistributionLicense ?? '(ABSENT)'}`);
    console.log(`conf: Versification=${conf.Versification ?? '(absent = KJV)'} Version=${conf.Version ?? '?'}`);
    if (!isAllowedLicense(conf.DistributionLicense ?? '')) {
      console.error(`FAIL CLOSED: DistributionLicense="${conf.DistributionLicense ?? '(absent)'}" is not in the allowed set — NOT decoding.`);
      process.exit(1);
    }
    console.log('license gate: PASS (allowed set: Public Domain | CC BY | CC BY-SA)');
    if ((conf.Versification ?? 'KJV') !== 'KJV') {
      console.error(`FAIL CLOSED: Versification=${conf.Versification} is not KJV — a non-KJV canon needs an explicit, reviewable mapping artifact, not a silent decode.`);
      process.exit(1);
    }
    if (conf.ModDrv?.toLowerCase() !== 'ztext' || (conf.CompressType ?? '').toUpperCase() !== 'ZIP') {
      throw new Error(`unsupported module: ModDrv=${conf.ModDrv} CompressType=${conf.CompressType} (only zText/ZIP)`);
    }

    const canon = loadKjvCanon();
    const dataRel = (conf.DataPath ?? '').replace(/^\.\//, '');
    const dataDir = path.join(moduleDir, dataRel);
    const present = (['ot', 'nt'] as const).filter((t) =>
      existsSync(path.join(dataDir, `${t}.bzv`)) || existsSync(path.join(dataDir, `${t}.czv`)));
    console.log(`testament coverage: ${present.length ? present.join(', ') : 'NONE'}`);
    if (present.length < 2) {
      console.log(`⚠ module does NOT span both testaments (has: ${present.join(', ') || 'none'}) — absent books are a coverage note, recorded in the license record`);
    }

    const outDir = path.join(outRoot, id);
    if (existsSync(outDir) && readdirSync(outDir).length > 0) {
      throw new Error(`${outDir} already exists — refusing to clobber an existing translation (delete it deliberately first)`);
    }

    let chaptersWritten = 0;
    let versesWritten = 0;
    let linkedMerged = 0;
    const emptyVerses: string[] = [];

    for (const testament of present) {
      const blockChar = existsSync(path.join(dataDir, `${testament}.bzv`)) ? 'b' : 'c';
      const slots = readSlots(readFileSync(path.join(dataDir, `${testament}.${blockChar}zv`)));
      const blockIdx = readFileSync(path.join(dataDir, `${testament}.${blockChar}zs`));
      const blob = readFileSync(path.join(dataDir, `${testament}.${blockChar}zz`));

      const books = canon.filter((b) => (testament === 'ot' ? b.book <= 39 : b.book >= 40));
      const expected = 2 + books.length + books.reduce((a, b) => a + b.verses.length, 0)
        + books.reduce((a, b) => a + b.verses.reduce((x, y) => x + y, 0), 0);
      if (slots.length !== expected) {
        throw new Error(`slot-count drift: ${testament} has ${slots.length} slots, KJV canon expects ${expected} — WRONG VERSIFICATION, stop`);
      }

      const blockCache = new Map<number, Buffer>();
      const getBlock = (n: number): Buffer => {
        const hit = blockCache.get(n);
        if (hit) return hit;
        const off = blockIdx.readUInt32LE(n * 12);
        const comp = blockIdx.readUInt32LE(n * 12 + 4);
        const buf = inflateSync(blob.subarray(off, off + comp));
        blockCache.set(n, buf);
        return buf;
      };

      let i = 2; // skip [module intro][testament intro]
      for (const b of books) {
        i++; // book intro
        for (let ch = 1; ch <= b.verses.length; ch++) {
          i++; // chapter intro
          const verses: { verse: number; text: string }[] = [];
          let prevKey = '';
          for (let v = 1; v <= b.verses[ch - 1]!; v++, i++) {
            const s = slots[i]!;
            const key = `${s.block}:${s.start}:${s.size}`;
            let text = '';
            if (s.size === 0) {
              text = '';
            } else if (key === prevKey) {
              linkedMerged++;
              text = ''; // merged into the previous verse — text emitted there
            } else {
              text = stripMarkup(getBlock(s.block).subarray(s.start, s.start + s.size).toString('utf8'));
            }
            prevKey = key;
            if (!text) emptyVerses.push(`${b.slug} ${ch}:${v}`);
            verses.push({ verse: v, text });
          }
          const chDir = path.join(outDir, b.slug);
          mkdirSync(chDir, { recursive: true });
          writeFileSync(
            path.join(chDir, `${ch}.json`),
            JSON.stringify({ book: b.book, chapter: ch, translation: id, verses }),
          );
          chaptersWritten++;
          versesWritten += verses.length;
        }
      }
    }

    console.log(`decoded: ${chaptersWritten} chapters, ${versesWritten} verse slots → ${outDir}/<slug>/<ch>.json`);
    if (linkedMerged > 0) console.log(`linked/merged verse slots (text on first of run): ${linkedMerged}`);
    console.log(`empty-text verses: ${emptyVerses.length}${emptyVerses.length ? ` — e.g. ${emptyVerses.slice(0, 8).join(', ')}` : ''}`);
    // Spot samples for eyeball verification.
    for (const probe of ['gen/1.json', 'psa/23.json', 'jhn/3.json', 'rev/22.json']) {
      const p = path.join(outDir, probe);
      if (!existsSync(p)) continue;
      const j = JSON.parse(readFileSync(p, 'utf8')) as { verses: { verse: number; text: string }[] };
      console.log(`  sample ${probe} v1: ${j.verses[0]?.text.slice(0, 110)}`);
    }
  } finally {
    rmSync(stage, { recursive: true, force: true });
  }
}

main().catch((e) => { console.error(e?.message ?? e); process.exit(1); });

// github structured-data adapter — Open Hymnal Project (manifest slug
// openhymnal). Parses the ABC Plus source files in a pinned checkout of
// github.com/mzealey/openhymnal (Complete/*\/*.abc) into JSONL {key, text},
// one entry per hymn, with the project's scripture (%OHSCRIP), meter
// (%OHMETRICAL) and category (%OHCATEGORY) tags carried into the text so the
// sections are searchable by citation and meter.
//
//   npx tsx src/ingest/adapter-openhymnal.ts \
//     --dir=data/raw/github/openhymnal/repo/Complete \
//     --out=data/raw/github/openhymnal/openhymnal.jsonl
//
// LICENCE GATE (fail closed, per file): the compilation is PD (Open Hymnal
// copying page: "All content produced specifically by the Open Hymnal which
// is not a part of a hymn is placed into the public domain... including
// compilation"), but individual hymns carry per-part copyright — most are
// "public domain", some are worship-use-only licences ("Words: Copyright
// 2009 ... may be freely reproduced ... for Christian worship") which are NOT
// an allowed licence. We store WORDS, so a file is included only when its
// C: copyright line marks the words public domain:
//   - "copyright: public domain ..."                          (282 files)
//   - "copyright: Words [and Music,] public domain ..."       (2 files)
//   - "copyright: Music & Lyrics public domain ..."           (1 file)
// Everything else — explicit Words copyright, tune/setting-only PD, the
// worship-use licence, and files with NO copyright line — is excluded.
// Verified by reading every non-matching copyright line, 2026-09-07.
//
// LYRICS: verses 1..N usually live in ABC `w:` fields (syllable-hyphenated,
// one fragment per system per verse) and later verses in clean `W:` blocks.
// `w:` fragments are accumulated per verse number across the file from the
// FIRST voice that carries lyrics, then de-hyphenated ("A- bide" → "Abide";
// `\-` is an escaped literal hyphen; `*` and `_` are skip tokens; `~` is a
// word-joining space). `W:` blocks win on overlap. A hymn that yields no
// verse text fails closed.
//
// FAIL CLOSED on structure surprises: fewer than FLOOR included hymns means
// the parse broke (289 dirs / 301 abc files at the pinned commit; 285 pass
// the licence gate), keys must be unique (duplicate titles are disambiguated
// with the tune name from the filename).

import { readdirSync, readFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { sanitizeForIngest } from './content-sanity.js';

const arg = (flag: string) => process.argv.find((a) => a.startsWith(`${flag}=`))?.slice(flag.length + 1);

const FLOOR = 250;

export interface HymnRecord { key: string; text: string }

interface AbcHeader {
  title: string;
  copyrightLine: string | null;
  author: string | null;
  translator: string | null;
  scripture: string | null;
  meter: string | null;
  category: string | null;
}

export function parseHeader(abc: string): AbcHeader {
  const grab = (re: RegExp) => abc.match(re)?.[1]?.trim() ?? null;
  const title = grab(/^T:\s*(.+)$/m);
  if (!title) throw new Error('FAIL CLOSED: abc file without a T: title');
  return {
    title,
    copyrightLine: grab(/^C:\s*(copyright:.+)$/im),
    author: grab(/^%OHAUTHOR\s+(.+)$/m),
    translator: grab(/^%OHTRANSLATOR\s+(.+)$/m),
    scripture: grab(/^%OHSCRIP\s+(.+)$/m),
    meter: grab(/^%OHMETRICAL\s+(.+)$/m),
    category: grab(/^%OHCATEGORY\s+(.+)$/m),
  };
}

// The licence gate. We store words; the words must be public domain.
export function wordsArePublicDomain(copyrightLine: string | null): boolean {
  if (!copyrightLine) return false; // missing config denies
  const l = copyrightLine.toLowerCase();
  if (/^copyright:\s*public domain\b/.test(l)) return true;
  // "Words and Music, public domain" / "Words, public domain" /
  // "Music & Lyrics public domain" — the span between words|lyrics and
  // "public domain" may not cross "." or ":" (so "Words: Copyright 2010 ..."
  // can never match).
  return /(?:words|lyrics)[^.:]{0,25}\bpublic domain\b/.test(l);
}

const HYPHEN_PLACEHOLDER = '';

function cleanFragment(s: string): string {
  return s
    .replace(/\\-/g, HYPHEN_PLACEHOLDER) // escaped literal hyphen survives de-hyphenation
    .replace(/[*_]/g, ' ') // ABC skip tokens
    .replace(/\s+/g, ' ')
    .trim();
}

function dehyphenate(fragments: string[]): string {
  return fragments
    .join(' ')
    .replace(/-\s+/g, '') // syllable join: "A- bide" → "Abide"
    .replace(/~/g, ' ') // ABC word-join → space
    .replace(new RegExp(HYPHEN_PLACEHOLDER, 'g'), '-')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

// Verses from `w:` fields (first lyric-carrying voice only) merged with `W:`
// block verses. Returns an ordered [verseNumber, text] list.
//
// `w:` layout in this corpus (surveyed all 301 files, 2026-09-07): within a
// system the k-th `w:` line belongs to verse k; only the FIRST system numbers
// its lines ("1.~..."), later systems repeat the same verse order unnumbered.
// So each time the lyric voice's section re-opens ("[V: S1V1]"), the position
// counter resets and the k-th line maps to verse k; an explicit number always
// wins and re-syncs the counter.
export function extractVerses(abc: string): Array<[number, string]> {
  const wFragments = new Map<number, string[]>();
  const wBlocks = new Map<number, string[]>();
  let currentVoice: string | null = null;
  let lyricVoice: string | null = null;
  const sysPos = new Map<string, number>(); // per-voice position within the current system
  let currentW = 0; // verse number open for unnumbered W: continuation lines

  for (const rawLine of abc.split('\n')) {
    const line = rawLine.trimEnd();
    // Bracketed "[V: name]" opens a system section (position counter resets);
    // unbracketed "V: name ..." is a header declaration (no reset).
    const voice = line.match(/^(\[?)V:\s*([^\s\]]+)/);
    if (voice) {
      const v = voice[2]!;
      if (voice[1] === '[') sysPos.set(v, 0);
      currentVoice = v;
      continue;
    }

    const w = line.match(/^w:\s*(?:(\d+)\s*[.)]\s*~?\s*)?(.*)$/);
    if (w) {
      if (lyricVoice === null) lyricVoice = currentVoice;
      if (currentVoice === lyricVoice && currentVoice !== null) {
        const pos = (sysPos.get(currentVoice) ?? 0) + 1;
        const verse = w[1] !== undefined ? parseInt(w[1], 10) : pos;
        sysPos.set(currentVoice, verse); // explicit numbers re-sync the counter
        if (verse > 0 && w[2]!.trim().length > 0) {
          const frags = wFragments.get(verse) ?? [];
          frags.push(cleanFragment(w[2]!));
          wFragments.set(verse, frags);
        }
      }
      continue;
    }

    const W = line.match(/^W:\s*(?:(\d+)\s*[.)]\s*)?(.*)$/);
    if (W) {
      if (W[1] !== undefined) currentW = parseInt(W[1], 10);
      if (currentW > 0 && W[2]!.trim().length > 0) {
        const parts = wBlocks.get(currentW) ?? [];
        parts.push(W[2]!.trim());
        wBlocks.set(currentW, parts);
      }
    }
  }

  const numbers = new Set([...wFragments.keys(), ...wBlocks.keys()]);
  const out: Array<[number, string]> = [];
  for (const n of [...numbers].sort((a, b) => a - b)) {
    const block = wBlocks.get(n);
    const text = block !== undefined
      ? block.join('\n')
      : dehyphenate(wFragments.get(n) ?? []);
    if (text.length > 0) out.push([n, text]);
  }
  return out;
}

export function parseHymn(abc: string, filename: string): HymnRecord | null {
  const header = parseHeader(abc);
  if (!wordsArePublicDomain(header.copyrightLine)) return null; // licence gate

  const verses = extractVerses(abc);
  if (verses.length === 0) {
    throw new Error(`FAIL CLOSED: ${filename} passed the licence gate but yielded no verse text`);
  }
  const body = verses.map(([n, t]) => `${n}. ${t}`).join('\n\n');
  if (body.length < 40) {
    throw new Error(`FAIL CLOSED: ${filename} yielded only ${body.length} chars of lyric text`);
  }

  const meta = [
    header.author && header.author !== 'none' && `Words: ${header.author}`,
    header.translator && header.translator !== 'none' && `Translator: ${header.translator}`,
    header.scripture && `Scripture: ${header.scripture}`,
    header.meter && `Meter: ${header.meter}`,
    header.category && `Category: ${header.category.toLowerCase()}`,
  ].filter((m): m is string => typeof m === 'string');

  return { key: header.title, text: sanitizeForIngest(`${body}\n\n${meta.join('\n')}`) };
}

function main() {
  const dir = arg('--dir') ?? 'data/raw/github/openhymnal/repo/Complete';
  const outPath = arg('--out') ?? 'data/raw/github/openhymnal/openhymnal.jsonl';

  const files: string[] = [];
  for (const d of readdirSync(dir, { withFileTypes: true })) {
    if (!d.isDirectory()) continue;
    for (const f of readdirSync(path.join(dir, d.name))) {
      if (f.endsWith('.abc')) files.push(path.join(dir, d.name, f));
    }
  }
  if (files.length < FLOOR) throw new Error(`FAIL CLOSED: only ${files.length} abc files found — wrong checkout?`);

  const records: HymnRecord[] = [];
  let excluded = 0;
  for (const f of files.sort()) {
    const rec = parseHymn(readFileSync(f, 'utf8'), path.basename(f));
    if (rec === null) { excluded++; continue; }
    records.push(rec);
  }

  // Duplicate titles (same hymn, several tune settings) get the tune name
  // from the filename suffix: Abide_With_Me-Eventide.abc → "(Eventide)".
  const seen = new Map<string, number>();
  for (let i = 0; i < records.length; i++) {
    const n = (seen.get(records[i]!.key) ?? 0) + 1;
    seen.set(records[i]!.key, n);
    if (n > 1) {
      const tune = files.filter((f) => parseHeader(readFileSync(f, 'utf8')).title === records[i]!.key)
        .map((f) => path.basename(f, '.abc').split('-').pop())?.[n - 1];
      records[i]!.key = `${records[i]!.key}${tune ? ` (${tune.replace(/_/g, ' ')})` : ` [setting ${n}]`}`;
    }
  }
  const keys = new Set(records.map((r) => r.key));
  if (keys.size !== records.length) {
    throw new Error(`FAIL CLOSED: ${records.length - keys.size} duplicate titles survived disambiguation`);
  }
  if (records.length < FLOOR) {
    throw new Error(`FAIL CLOSED: only ${records.length} hymns passed the gate (< ${FLOOR}) — parse failure, do not use this output`);
  }

  mkdirSync(path.dirname(outPath), { recursive: true });
  writeFileSync(outPath, records.map((r) => JSON.stringify(r)).join('\n') + '\n');
  console.log(`openhymnal → ${records.length} hymns (${excluded} excluded by the licence gate) → ${outPath}`);
  for (const r of [records[0], records[Math.floor(records.length / 2)], records[records.length - 1]]) {
    if (r) console.log(`  sample ${r.key}  ${r.text.slice(0, 100).replace(/\n/g, ' ')}`);
  }
}

if (process.argv[1] && /adapter-openhymnal/.test(process.argv[1])) {
  try {
    main();
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

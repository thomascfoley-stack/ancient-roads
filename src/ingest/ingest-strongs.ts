// Ingests Strong's Greek + Hebrew dictionaries (openscriptures, public-domain
// Strong's 1890 text) into normalized JSON the app serves statically:
//   web/public/lexicon/greek.json   (keyed by "G1".."G5624")
//   web/public/lexicon/hebrew.json  (keyed by "H1".."H8674")
// Each entry: { lemma, translit, pron, def, derivation, kjv }
// These power the Word Study lookup and the "full definition" tap in the reader
// interlinear. Re-runnable.

import { writeFileSync, mkdirSync } from 'fs';

const OUT = 'web/public/lexicon';

const SOURCES = {
  greek: 'https://raw.githubusercontent.com/openscriptures/strongs/master/greek/strongs-greek-dictionary.js',
  hebrew: 'https://raw.githubusercontent.com/openscriptures/strongs/master/hebrew/strongs-hebrew-dictionary.js',
};

interface RawEntry {
  lemma?: string;
  xlit?: string;
  translit?: string;
  pron?: string;
  pronounce?: string;
  strongs_def?: string;
  derivation?: string;
  kjv_def?: string;
}

interface Entry {
  lemma: string;
  translit: string;
  pron: string;
  def: string;
  derivation: string;
  kjv: string;
}

function parseJsDict(js: string): Record<string, RawEntry> {
  // File is `var xDictionary = { ... };` with a JS-comment header. Slice the
  // object literal and evaluate it in a sandboxed Function.
  const start = js.indexOf('{');
  const end = js.lastIndexOf('}');
  const objLiteral = js.slice(start, end + 1);
  // eslint-disable-next-line @typescript-eslint/no-implied-eval
  return Function(`"use strict"; return (${objLiteral});`)();
}

function normalize(raw: RawEntry): Entry {
  return {
    lemma: raw.lemma ?? '',
    translit: raw.translit ?? raw.xlit ?? '',
    pron: raw.pron ?? raw.pronounce ?? '',
    def: (raw.strongs_def ?? '').trim(),
    derivation: (raw.derivation ?? '').trim(),
    kjv: (raw.kjv_def ?? '').trim(),
  };
}

async function ingest(lang: 'greek' | 'hebrew') {
  const res = await fetch(SOURCES[lang]);
  const js = await res.text();
  const raw = parseJsDict(js);
  const out: Record<string, Entry> = {};
  for (const [key, val] of Object.entries(raw)) {
    out[key] = normalize(val);
  }
  mkdirSync(OUT, { recursive: true });
  writeFileSync(`${OUT}/${lang}.json`, JSON.stringify(out));
  const sample = Object.keys(out)[0];
  console.log(`${lang}: ${Object.keys(out).length} entries -> ${OUT}/${lang}.json`);
  console.log(`  sample ${sample}:`, JSON.stringify(out[sample!]).slice(0, 120));
  return out;
}

async function main() {
  await ingest('greek');
  await ingest('hebrew');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

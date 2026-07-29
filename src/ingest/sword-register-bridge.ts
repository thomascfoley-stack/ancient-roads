// Bridge a sword-zverse JSONL ({author, verseId, verseEnd, content} per line)
// into the SERVED register store via register-writer — work slug, whole-chunk
// vectors, static reader entries. Used by the go-live queue for Catena (zCom);
// any future zCom module rides the same path.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev DEEPINFRA_API_KEY=<key> \
//     npx tsx src/ingest/sword-register-bridge.ts --jsonl=data/raw/sword/catena-nt.jsonl --slug=catena-aurea

import { readFileSync } from 'node:fs';
import { BOOKS } from '../bible/books.js';
import { writeRegisterWork, type RegisterSection, type RegisterWork } from './register-writer.js';

const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

async function main() {
  const jsonl = arg('--jsonl');
  const slug = arg('--slug');
  if (!jsonl || !slug) throw new Error('usage: sword-register-bridge.ts --jsonl=<f> --slug=<manifest slug>');
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`FAIL CLOSED: no manifest entry ${slug}`);
  const prov = entry.provenance as Record<string, unknown>;

  const sections: RegisterSection[] = [];
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const e = JSON.parse(line) as { verseId: number; verseEnd?: number; content: string };
    const book = Math.floor(e.verseId / 1e6), ch = Math.floor((e.verseId % 1e6) / 1000), vs = e.verseId % 1000;
    const bookName = BOOKS[book - 1]?.name ?? `book${book}`;
    sections.push({
      heading: `${bookName} ${ch}:${vs}`,
      body: e.content,
      anchors: [{ verseIdStart: e.verseId, verseIdEnd: e.verseEnd ?? e.verseId }],
    });
  }
  if (sections.length < 10) throw new Error(`FAIL CLOSED: only ${sections.length} entries`);

  const work: RegisterWork = {
    slug, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: entry.year_written as number,
    sourceType: entry.source_type as string, register: 'prose', tradition: entry.tradition as string,
    era: entry.era as string, license: entry.license as string, url: prov.url as string,
    edition: (prov.edition as string) ?? '', publish: entry.serve !== false, sections,
  };
  const r = await writeRegisterWork(work);
  console.log(`${slug}: ${sections.length} entries → ${r.embedded} embedded, ${r.staticEntries} static reader entries`);
}

main().catch((e) => { console.error(e); process.exit(1); });

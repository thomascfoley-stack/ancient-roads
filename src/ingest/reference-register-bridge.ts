// Bridge a REFERENCE work ({key, text} JSONL from sword-ld / adapter-bdb /
// adapter-archive) into the register store as STAGED — reference works are
// topic-keyed (no verse anchors, no static reader entries) and are NEVER wired
// into a serving surface here: how lexicons/dictionaries surface is an owner
// design call (GO_LIVE 2026-07-17 pre-auth: "ingest to STAGED reference; do
// NOT wire a new serving UX"). The served lists in routing.ts do not contain
// these slugs, so nothing can retrieve them.
//
//   DATABASE_URL=<dev owner> NEON_BRANCH=dev DEEPINFRA_API_KEY=<key> \
//     npx tsx src/ingest/reference-register-bridge.ts --jsonl=data/raw/sword/isbe.jsonl --slug=isbe

import { readFileSync } from 'node:fs';
import { writeRegisterWork, type RegisterSection, type RegisterWork } from './register-writer.js';

const arg = (f: string) => process.argv.find((a) => a.startsWith(`${f}=`))?.slice(f.length + 1);

async function main() {
  const jsonl = arg('--jsonl');
  const slug = arg('--slug');
  if (!jsonl || !slug) throw new Error('usage: reference-register-bridge.ts --jsonl=<f> --slug=<manifest slug>');
  const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8')) as Array<Record<string, unknown>>;
  const entry = manifest.find((e) => e.slug === slug);
  if (!entry) throw new Error(`FAIL CLOSED: no manifest entry ${slug}`);
  const prov = entry.provenance as Record<string, unknown>;

  const sections: RegisterSection[] = [];
  for (const line of readFileSync(jsonl, 'utf8').trim().split('\n')) {
    const e = JSON.parse(line) as { key: string; text: string };
    if (!e.key || !e.text || e.text.trim().length < 20) continue;
    sections.push({ heading: e.key, body: e.text }); // topic-keyed: NO anchors
  }
  if (sections.length < 100) throw new Error(`FAIL CLOSED: only ${sections.length} entries — parse incomplete`);

  const work: RegisterWork = {
    slug, title: entry.title as string, author: entry.author as string,
    authorDied: entry.author_died as number | undefined, year: entry.year_written as number,
    sourceType: entry.source_type as string, register: 'prose', tradition: entry.tradition as string,
    era: entry.era as string, license: entry.license as string, url: prov.url as string,
    edition: (prov.edition as string) ?? '',
    publish: false, // ALWAYS staged — serving is an owner decision, not this script's
    sections,
  };
  const r = await writeRegisterWork(work);
  console.log(`${slug}: ${sections.length} reference entries → ${r.embedded} embedded, STAGED (never served)`);
}

main().catch((e) => { console.error(e); process.exit(1); });

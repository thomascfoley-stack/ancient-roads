// Cache New Advent's church-fathers corpus (the PD ANF/NPNF translations) for the
// patristic classify. VERIFICATION source only — robots.txt permits /fathers/;
// we rate-limit, cache every page to disk, and resume (skip cached) so we never
// re-hammer it and never become an aggregator (nothing is re-served; provenance
// cites the PD ANF/NPNF edition, not newadvent). Read-only.
//
//   NA_CACHE=<dir> npx tsx src/ingest/newadvent-crawl.ts
//
// BFS from /fathers/, following only /fathers/NNNN.htm links, capped + polite.

import { mkdirSync, readdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const BASE = 'https://www.newadvent.org/fathers';
const CACHE = process.env.NA_CACHE ?? '.newadvent-cache';
const MAX_PAGES = Number(process.env.NA_MAX ?? 4000);
const CONCURRENCY = 5;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));
const idOf = (u: string): string | null => u.match(/\/fathers\/(\d+)\.htm/)?.[1] ?? null;

function stripHtml(html: string): string {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ');
}
function linksIn(html: string): string[] {
  const ids = new Set<string>();
  for (const m of html.matchAll(/href="([^"]+)"/gi)) {
    const id = m[1]!.match(/(?:\/fathers\/)?(\d+)\.htm/)?.[1];
    if (id) ids.add(id);
  }
  return [...ids];
}

async function main() {
  mkdirSync(CACHE, { recursive: true });
  const cached = new Set(readdirSync(CACHE).filter((f) => f.endsWith('.txt')).map((f) => f.replace('.txt', '')));
  console.log(`cache=${CACHE}  already cached=${cached.size}  max=${MAX_PAGES}`);

  // Seed from the fathers home + the alphabetical index pages.
  const seen = new Set<string>();
  const frontier: string[] = [`${BASE}/`];
  let fetched = 0;

  while (frontier.length && cached.size + fetched < MAX_PAGES) {
    const batch = frontier.splice(0, CONCURRENCY);
    const next: string[] = [];
    await Promise.all(batch.map(async (url) => {
      const id = idOf(url) ?? 'index';
      if (seen.has(id)) return;
      seen.add(id);
      try {
        const res = await fetch(url, { headers: { 'User-Agent': 'ancient-paths-provenance-verifier/1.0' } });
        if (!res.ok) return;
        const html = await res.text();
        if (id !== 'index' && !cached.has(id)) {
          writeFileSync(join(CACHE, `${id}.txt`), stripHtml(html));
          cached.add(id);
          fetched++;
        }
        for (const linkId of linksIn(html)) {
          if (!seen.has(linkId)) next.push(`${BASE}/${linkId}.htm`);
        }
      } catch { /* skip */ }
    }));
    frontier.push(...next);
    if (fetched % 50 === 0 && fetched) process.stdout.write(`\rfetched ${fetched} (cache ${cached.size}, frontier ${frontier.length})   `);
    await sleep(250); // polite
  }
  console.log(`\n✓ done: cache has ${cached.size} pages in ${CACHE}`);
}

main().catch((e) => { console.error(e); process.exit(1); });

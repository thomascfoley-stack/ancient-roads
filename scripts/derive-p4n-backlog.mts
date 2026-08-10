import pg from 'pg';
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { isAllowedLicense } from '../src/ingest/allowed-licenses.mjs';
import { forbiddenProvenanceDomain } from '../src/ingest/forbidden-provenance.mjs';

const dev = new pg.Client({ connectionString: process.env.DEV_URL, ssl: { rejectUnauthorized: false } });
const prod = new pg.Client({ connectionString: process.env.PROD_URL, ssl: { rejectUnauthorized: false } });
await dev.connect(); await prod.connect();

const devRows = (await dev.query(`SELECT slug, status, source_type FROM sources WHERE status IN ('staged','published')`)).rows;
const prodSlugs = new Set((await prod.query(`SELECT slug FROM sources`)).rows.map((r) => r.slug));
await dev.end(); await prod.end();

const manifest = JSON.parse(readFileSync('ingest/sources.config.json', 'utf8'));
interface ManifestEntry { slug: string; serve?: boolean; license?: string; provenance?: { url?: string } }
const mBy = new Map<string, ManifestEntry>((manifest as ManifestEntry[]).map((e) => [e.slug, e]));
const eligible = (slug: string) => {
  const e = mBy.get(slug);
  if (!e) return 'not in manifest';
  if (e.serve === false) return 'withheld (serve:false)';
  if (!isAllowedLicense(e.license)) return `license "${e.license}"`;
  const url = e.provenance?.url;
  if (url && forbiddenProvenanceDomain(url)) return `forbidden provenance`;
  return null;
};

const backlog: Record<string, string[]> = {};
let ineligible = 0;
for (const r of devRows) {
  if (prodSlugs.has(r.slug)) continue;
  const why = eligible(r.slug);
  if (why) { ineligible++; continue; }
  (backlog[r.source_type] ??= []).push(r.slug);
}
console.log(`dev staged+published: ${devRows.length}; already on prod: ${devRows.length - Object.values(backlog).flat().length - ineligible}; ineligible: ${ineligible}`);
console.log(`P4.n backlog: ${Object.values(backlog).flat().length} works`);
for (const [t, slugs] of Object.entries(backlog).sort()) console.log(`  ${t}: ${slugs.length}`);

mkdirSync('docs/evidence/corpus-copy/p4n', { recursive: true });
for (const [t, slugs] of Object.entries(backlog).sort()) {
  writeFileSync(`docs/evidence/corpus-copy/p4n/${t}.json`, JSON.stringify({ slugs: slugs.sort() }, null, 2));
}
writeFileSync('docs/evidence/corpus-copy/p4n/_summary.json', JSON.stringify({
  derivedAt: new Date().toISOString(),
  devRows: devRows.length,
  backlog: Object.fromEntries(Object.entries(backlog).map(([t, s]) => [t, s.length])),
}, null, 2));
console.log('batch files written to docs/evidence/corpus-copy/p4n/');

import { readFileSync, existsSync } from 'fs';
import { createPgStore } from '../retrieval/store.js';
import { createDeepInfraEmbedder } from '../retrieval/embedder.js';
import { ingestCorpus } from '../retrieval/ingest.js';
import { readCommentaryDocs } from '../retrieval/sources/commentary.js';

// CLI: embed one book's commentary into Neon pgvector.
//   pnpm ingest:embeddings jhn
function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8')
    .match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
}

async function main(): Promise<void> {
  const bookSlug = process.argv[2] ?? 'jhn';
  const apiKey = localEnv('DEEPINFRA_API_KEY');
  const db = localEnv('DATABASE_URL_UNPOOLED') ?? localEnv('DATABASE_URL');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY is required');
  if (!db) throw new Error('DATABASE_URL_UNPOOLED is required (env or web/.env.local)');

  const embedder = createDeepInfraEmbedder({ apiKey });
  const store = createPgStore(db);

  console.log(`Ingesting ${bookSlug} commentary with ${embedder.model}…`);
  const res = await ingestCorpus(readCommentaryDocs({ bookSlug }), { embedder, store }, { batchSize: 64 });
  console.log(`Embedded ${res.embedded} chunks, upserted ${res.upserted} new rows.`);

  await store.close();
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

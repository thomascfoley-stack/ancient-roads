import { readFileSync, existsSync } from 'fs';
import { createDeepInfraEmbedder } from '../retrieval/embedder.js';
import { createPgStore } from '../retrieval/store.js';
import { createLLM } from './llm.js';
import { teach } from './teacher.js';

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
  const query = process.argv[2] ?? 'What does the Gospel of John say about the Word becoming flesh?';
  const apiKey = localEnv('DEEPINFRA_API_KEY');
  const db = localEnv('APP_DATABASE_URL') ?? localEnv('DATABASE_URL');
  if (!apiKey) throw new Error('DEEPINFRA_API_KEY required');
  if (!db) throw new Error('APP_DATABASE_URL required');

  const embedder = createDeepInfraEmbedder({ apiKey });
  const store = createPgStore(db);
  const llm = createLLM({ apiKey });

  console.log(`Query: "${query}"`);
  console.log(`Model: ${llm.model}`);
  console.log();

  // Retrieve first, then close DB before the slow LLM call
  console.log('Retrieving...');
  const vec = await embedder.embed([query]);
  const retrieved = await store.search(vec[0]!, { limit: 6, sourceType: 'commentary' });
  await store.close();
  console.log(`Retrieved ${retrieved.length} sources.\n`);

  const result = await teach(query, {
    retrieve: async () => retrieved,
    generate: llm.generate.bind(llm),
    corpusLookup: undefined as never,
    maxRetries: 2,
  });

  switch (result.kind) {
    case 'empty':
      console.log(`EMPTY: ${result.reason}`);
      break;

    case 'fallback':
      console.log('FALLBACK — verifier rejected all attempts.');
      console.log('Violations:');
      for (const v of result.violations) {
        console.log(`  [${v.check}] ${v.message}${v.span ? ` — "${v.span}"` : ''}`);
      }
      console.log('\nRaw retrieval results:');
      for (const r of result.retrieval.slice(0, 5)) {
        console.log(`  ${r.score.toFixed(4)} | ${r.metadata.author} — ${r.content.slice(0, 100)}…`);
      }
      break;

    case 'composed':
      console.log('COMPOSED — verifier passed.\n');
      for (const block of result.response.blocks) {
        switch (block.type) {
          case 'framing':
            console.log(`[FRAMING] ${block.text}\n`);
            break;
          case 'voice':
            console.log(`[VOICE] ${block.attribution.author} — ${block.attribution.work} (${block.attribution.tradition})`);
            console.log(`  Quote: "${block.quote.slice(0, 300)}${block.quote.length > 300 ? '…' : ''}"`);
            if (block.summary) console.log(`  Summary: ${block.summary}`);
            console.log();
            break;
          case 'passages':
            console.log(`[PASSAGES] ${block.items.map((i) => `${i.start}-${i.end} (${i.translation})`).join(', ')}\n`);
            break;
        }
      }
      break;
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});

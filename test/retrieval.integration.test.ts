import { describe, it, expect } from 'vitest';
import { readFileSync, existsSync } from 'fs';
import { createNeonStore } from '../src/retrieval/store';
import { createDeepInfraEmbedder } from '../src/retrieval/embedder';
import { ingestCorpus } from '../src/retrieval/ingest';
import { retrieve } from '../src/retrieval/retrieve';
import { readCommentaryDocs } from '../src/retrieval/sources/commentary';

// Real end-to-end smoke: ingest one book into Neon pgvector with a real embedder,
// then assert a semantic query surfaces the expected verse. Writes real platform
// rows. GATED — skipped unless DEEPINFRA_API_KEY is set. Run:
//   DEEPINFRA_API_KEY=... pnpm test retrieval.integration
function localEnv(name: string): string | undefined {
  if (process.env[name]) return process.env[name];
  const p = 'web/.env.local';
  if (!existsSync(p)) return undefined;
  return readFileSync(p, 'utf-8')
    .match(new RegExp(`^${name}=(.*)`, 'm'))?.[1]
    ?.trim()
    .replace(/^"|"$/g, '');
}

const apiKey = localEnv('DEEPINFRA_API_KEY');
const db = localEnv('DATABASE_URL');

// Opt-in only: this hits the live DeepInfra API and writes real rows, so it must
// NOT run in `npm run audit` / CI. Run it explicitly:
//   RUN_INTEGRATION=1 corepack pnpm vitest run test/retrieval.integration.test.ts
describe.skipIf(!process.env.RUN_INTEGRATION || !apiKey || !db)('retrieval integration (real Neon + DeepInfra)', () => {
  it('surfaces John 1:14 for an incarnation query', async () => {
    const embedder = createDeepInfraEmbedder({ apiKey: apiKey! });
    const store = createNeonStore(db!);

    await ingestCorpus(readCommentaryDocs({ bookSlug: 'jhn' }), { embedder, store }, { batchSize: 64 });

    const results = await retrieve(
      { text: 'the Word became flesh and dwelt among us', limit: 10 },
      { embedder, store },
    );

    expect(results.length).toBeGreaterThan(0);
    expect(results.slice(0, 6).some((r) => r.verseId === 43001014)).toBe(true);
  }, 600_000);
});

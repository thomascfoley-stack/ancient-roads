// Model parity — the check that stops the tradition-gap join comparing vectors from two spaces.
//
// §6 calls this non-negotiable and names the failure precisely: a mismatch "silently returns
// garbage — no error, just subtly wrong results forever". Jina v3 is ALSO 1024-dim, so a wrong
// vector inserts, joins and scores cleanly. There is nothing to catch except a check that looks.
//
// NO API CALL ANYWHERE IN THIS FILE. Neither CI job supplies DEEPINFRA_API_KEY, so a parity check
// that needed the network would never run where it matters. The assertions are about STORED VALUES
// and are seeded directly.

import { existsSync, readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { beforeEach, describe, expect, it, vi } from 'vitest';

// '@/lib/db' is MOCKED (no database, no network — the file's charter holds): the H3 legs below
// drive the SHIPPED relatedVoices call path against seeded query results, because the defect they
// guard was invisible to every value-level assertion here — both call sites passed our own
// constant as the "corpus" side, and only a fake corpus that RECORDS a different model can see it.
type FakeQuery = { text: string; params: unknown[] };
const dbMock = vi.hoisted(() => ({
  respond: null as ((q: { text: string; params: unknown[] }) => unknown[]) | null,
}));
vi.mock('@/lib/db', () => ({
  runAsUser: async (_userId: string, build: (sql: unknown) => unknown[]): Promise<unknown[][]> => {
    const tag = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]): FakeQuery => ({
        text: strings.raw.join(' $? '),
        params: vals,
      }),
      { query: (text: string, params: unknown[] = []): FakeQuery => ({ text, params }) },
    );
    const qs = build(tag) as FakeQuery[];
    return qs.map((q) => (dbMock.respond ? dbMock.respond(q) : []));
  },
}));

import {
  EMBEDDING_API_MODEL,
  EMBEDDING_DB_SLUG,
  EMBEDDING_DIMS,
  __resetCorpusModelCache,
  corpusRecordedModel,
  isJoinable,
  isSameModel,
  normaliseModel,
  type CorpusQueryRunner,
} from '@/lib/user-corpus/model';
import { relatedVoices } from '@/lib/user-corpus/related-voices';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';

describe('the model constants', () => {
  it('names the model ADR-102 confirmed', () => {
    expect(EMBEDDING_API_MODEL).toBe('BAAI/bge-large-en-v1.5');
    expect(EMBEDDING_DIMS).toBe(1024);
  });

  it('DERIVES the db slug from the api id rather than repeating it', () => {
    // SEED: hand-type EMBEDDING_DB_SLUG as a second literal and change one of them -> RED.
    // Twelve hand-typed copies of this string already exist in the tree; the user plane gets one.
    expect(EMBEDDING_DB_SLUG).toBe('bge-large-en-v1.5');
    expect(EMBEDDING_API_MODEL.endsWith(EMBEDDING_DB_SLUG)).toBe(true);
  });
});

describe('normalisation — parity is about the MODEL, not the spelling', () => {
  it('treats the qualified and short forms as one model', () => {
    // Measured against the live database: the corpus stores BOTH.
    //   section_embeddings.model_slug   'bge-large-en-v1.5'       (362,948 rows)
    //   embeddings.metadata->>'model'   'BAAI/bge-large-en-v1.5'  (1,070,674 rows)
    // and the tradition-gap join reads `embeddings`, because that is where `served` lives. A check
    // that compared raw strings would be right about one plane and wrong about the other.
    expect(isSameModel('BAAI/bge-large-en-v1.5', 'bge-large-en-v1.5')).toBe(true);
    expect(normaliseModel('  BAAI/bge-large-en-v1.5 ')).toBe('bge-large-en-v1.5');
  });

  it('does NOT treat a different model as the same', () => {
    // The whole point. SEED: make normaliseModel return a constant -> RED.
    for (const other of ['jina-embeddings-v3', 'jinaai/jina-embeddings-v3', 'text-embedding-3-large', 'BAAI/bge-base-en-v1.5']) {
      expect(isSameModel(EMBEDDING_API_MODEL, other), other).toBe(false);
    }
  });

  it('is not fooled by a vendor prefix carrying the model name', () => {
    // `bge-large-en-v1.5/something-else` must not normalise to our model.
    expect(isSameModel(EMBEDDING_API_MODEL, 'bge-large-en-v1.5/v2')).toBe(false);
  });
});

describe('isJoinable — and the tautology it exists to avoid', () => {
  it('accepts a user row whose model matches what the CORPUS recorded', () => {
    expect(isJoinable(EMBEDDING_DB_SLUG, 'BAAI/bge-large-en-v1.5')).toBe(true);
    expect(isJoinable(EMBEDDING_DB_SLUG, 'bge-large-en-v1.5')).toBe(true);
  });

  it('REFUSES a user row embedded by a different model', () => {
    // The seeded-row red-proof the order asks for, with no API call.
    expect(isJoinable('jina-embeddings-v3', 'BAAI/bge-large-en-v1.5')).toBe(false);
  });

  it('has no default for the corpus side — the tautology is unrepresentable', () => {
    // THE POINT OF THE SIGNATURE. `userRow.model_slug === EMBED_MODEL` is tautologically green:
    // the writer and the check read the same constant, so every user row passes while silently
    // mismatching the corpus. isJoinable takes the corpus's own recorded value and cannot be
    // called without one — a caller must go and fetch reality.
    expect(isJoinable.length).toBe(2);
    // And it genuinely discriminates on that second argument rather than ignoring it.
    expect(isJoinable(EMBEDDING_DB_SLUG, 'jina-embeddings-v3')).toBe(false);
  });
});

describe('the single-source guard for the user plane', () => {
  it('no other file under lib/user-corpus/ contains the model literal', () => {
    // Modelled on test/ask-max-duration-literal.test.ts. SEED: paste 'bge-large-en-v1.5' into
    // embed.ts or queue.ts -> RED.
    //
    // SCOPED TO THE USER PLANE, deliberately and with the reason recorded: twelve hand-typed
    // copies already exist under src/ingest/ and web/src/lib/teacher/. Fixing those means editing
    // corpus ingest broadly, which is Lane A's surface and not this slice's. Asserting globally
    // here would either fail on day one or force that edit; asserting nothing would let the user
    // plane grow its own copies. This holds the line where this slice owns it.
    const dir = path.resolve(__dirname, '../../src/lib/user-corpus');
    const offenders: string[] = [];
    for (const f of readdirSync(dir).filter((n) => n.endsWith('.ts'))) {
      if (f === 'model.ts') continue;
      const src = readFileSync(path.join(dir, f), 'utf8');
      // Strip comments: model.ts's rationale is quoted in neighbours' comments on purpose.
      const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
      if (/bge-large-en-v1\.5/.test(code)) offenders.push(f);
    }
    expect(offenders, `import from ./model instead of re-typing the literal: ${offenders.join(', ')}`).toEqual([]);
  });

  it('the guard is not vacuous — it can see the literal when it is there', () => {
    // A grep guard that greps nothing passes forever. This proves the pattern matches.
    const dir = path.resolve(__dirname, '../../src/lib/user-corpus');
    expect(existsSync(path.join(dir, 'model.ts'))).toBe(true);
    const modelSrc = readFileSync(path.join(dir, 'model.ts'), 'utf8');
    expect(/bge-large-en-v1\.5/.test(modelSrc)).toBe(true);
  });
});

// ── H3 — the corpus side comes from the DATABASE, not our constant ──────────────────────────────
//
// The audit's finding: both shipped call sites called `isJoinable(slug, EMBEDDING_DB_SLUG)` — our
// constant on both sides — and the arity assertion above CANNOT see a wrong argument. These legs
// can: they read the corpus's recorded value through `corpusRecordedModel`, and they drive the
// real `relatedVoices` path against a corpus that records a DIFFERENT model.

/** A runner whose "corpus" answers every query with `rows`; the SQL it was asked is logged. */
function stubRunner(rows: { model: string }[], log: string[] = []): CorpusQueryRunner {
  return (async (build: (sql: unknown) => unknown[]) => {
    const tag = Object.assign(
      (strings: TemplateStringsArray, ...vals: unknown[]): FakeQuery => ({
        text: strings.raw.join(' $? '),
        params: vals,
      }),
      {
        query: (text: string, params: unknown[] = []): FakeQuery => {
          log.push(text);
          return { text, params };
        },
      },
    );
    const qs = build(tag) as FakeQuery[];
    return qs.map(() => rows);
  }) as unknown as CorpusQueryRunner;
}

describe('corpusRecordedModel — reading what the corpus actually recorded (H3)', () => {
  beforeEach(() => __resetCorpusModelCache());

  it('returns the recorded value, normalised, and reads it from the plane the joins target', async () => {
    const log: string[] = [];
    const r = await corpusRecordedModel(stubRunner([{ model: 'BAAI/bge-large-en-v1.5' }], log));
    expect(r).toEqual({ kind: 'one', model: 'bge-large-en-v1.5' });
    // Tripwire on the read itself: served corpus rows' recorded model, nothing else.
    expect(log[0]).toContain("metadata->>'model'");
    expect(log[0]).toContain('user_id IS NULL');
    expect(log[0]).toContain('served');
  });

  it('treats the two recorded SPELLINGS of one model as one model, not drift', async () => {
    // The measured trap in model.ts: `embeddings` records the qualified form,
    // `section_embeddings` the short form. One model; must not read as `mixed`.
    const r = await corpusRecordedModel(
      stubRunner([{ model: 'BAAI/bge-large-en-v1.5' }, { model: 'bge-large-en-v1.5' }]),
    );
    expect(r).toEqual({ kind: 'one', model: 'bge-large-en-v1.5' });
  });

  it('refuses with `mixed` when the corpus genuinely records two models — the drift alarm', async () => {
    const r = await corpusRecordedModel(
      stubRunner([{ model: 'BAAI/bge-large-en-v1.5' }, { model: 'jina-embeddings-v3' }]),
    );
    expect(r.kind).toBe('mixed');
  });

  it('returns `empty` when no served corpus row records a model — parity unverifiable', async () => {
    expect(await corpusRecordedModel(stubRunner([]))).toEqual({ kind: 'empty' });
  });

  it('caches per process until reset — the DISTINCT must not run per request', async () => {
    let calls = 0;
    const counting: CorpusQueryRunner = (async (build: (sql: unknown) => unknown[]) => {
      calls += 1;
      const qs = build(
        Object.assign(() => ({}), { query: (text: string, params: unknown[] = []) => ({ text, params }) }),
      ) as unknown[];
      return qs.map(() => [{ model: 'BAAI/bge-large-en-v1.5' }]);
    }) as unknown as CorpusQueryRunner;
    await corpusRecordedModel(counting);
    await corpusRecordedModel(counting);
    expect(calls).toBe(1);
    __resetCorpusModelCache();
    await corpusRecordedModel(counting);
    expect(calls).toBe(2);
  });
});

describe('the SHIPPED call path — relatedVoices must feed isJoinable the corpus value (H3)', () => {
  beforeEach(() => {
    __resetCorpusModelCache();
    dbMock.respond = null;
  });

  /** Seed the fake database: user rows carry OUR slug; the corpus plane records `model`. */
  function corpusRecords(models: string[]): void {
    dbMock.respond = (q) => {
      if (q.text.includes("metadata->>'model'")) return models.map((model) => ({ model }));
      if (q.text.includes('AVG(')) return [{ v: '[0.1,0.2]' }];
      if (q.text.includes('user_section_embeddings')) return [{ model_slug: 'bge-large-en-v1.5' }];
      return []; // sweeps, set_config
    };
  }

  it('REFUSES the join when the corpus plane records a different model', async () => {
    // THE red leg. Against the tautological call site (`isJoinable(slug, EMBEDDING_DB_SLUG)`)
    // this was watched fail: comparable stayed true with the corpus recording jina — the exact
    // "compare two vector spaces forever" failure §6 names.
    corpusRecords(['jina-embeddings-v3']);
    const r = await relatedVoices('u-parity', 'd-parity', corpusPredicate('true'));
    expect(r.comparable).toBe(false);
  });

  it('REFUSES the join while the corpus is mid-re-embed (two distinct models)', async () => {
    corpusRecords(['BAAI/bge-large-en-v1.5', 'jina-embeddings-v3']);
    const r = await relatedVoices('u-parity', 'd-parity', corpusPredicate('true'));
    expect(r.comparable).toBe(false);
  });

  it('control: the identical path with the corpus recording OUR model proceeds', async () => {
    // Proves the red legs above fail for the reason they claim, not as a harness artifact.
    corpusRecords(['BAAI/bge-large-en-v1.5']);
    const r = await relatedVoices('u-parity', 'd-parity', corpusPredicate('true'));
    expect(r.comparable).toBe(true);
  });
});

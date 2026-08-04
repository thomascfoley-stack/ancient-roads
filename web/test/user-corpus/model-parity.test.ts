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
import { describe, expect, it } from 'vitest';
import {
  EMBEDDING_API_MODEL,
  EMBEDDING_DB_SLUG,
  EMBEDDING_DIMS,
  isJoinable,
  isSameModel,
  normaliseModel,
} from '@/lib/user-corpus/model';

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

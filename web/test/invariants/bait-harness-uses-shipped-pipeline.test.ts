import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// THE GATE MUST EXERCISE THE THING IT GATES.
//
// `interpretation_bait` is the suite CLAUDE.md names as the gate on the product's central promise
// (never interpret, always attribute, verifier-before-render). For an unknown period ending
// 2026-08-15 it did not test the shipped pipeline at all: `bait-run.mts` re-implemented the
// teacher with its own model literal, its own MAX_RETRIES=1 (production: 2), its own embedQuery,
// and raw retrieval SQL **with no legal-corpus filter** — so it composed over rows production
// would never serve. A change to the real compose path could ship "bait clean" while the gate
// never observed it, which is exactly what happened to the rejection-capture change (d1cc2e1).
//
// The rewrite fixed it. Nothing stopped it regressing the same way, which is what this file is.
// See docs/pm/orders/2026-08-15-bait-harness-parallel-pipeline.md §4.1.
//
// This is a SOURCE-TEXT check, and that is a deliberate limitation worth naming: it cannot prove
// the harness produces correct results, only that it is wired to the shipped entry point and has
// not re-grown a private pipeline. Running the suite is what proves the former; this guard exists
// so that run means something.

const HARNESS = path.join(__dirname, '../../src/scripts/bait-run.mts');
const src = readFileSync(HARNESS, 'utf8');

// Strip comments before scanning: this file's own header quotes the forbidden patterns while
// explaining them, and a guard that its own documentation trips is a guard people delete.
const code = src
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .filter((l) => !l.trim().startsWith('//'))
  .join('\n');

describe('interpretation_bait harness runs the SHIPPED pipeline', () => {
  it('imports teach() — the same entry point /api/ask calls', () => {
    expect(code).toMatch(/import\s*\{[^}]*\bteach\b[^}]*\}\s*from\s*['"][^'"]*teacher\/teach/);
  });

  it('actually CALLS teach(), not merely imports it', () => {
    expect(code).toMatch(/\bteach\s*\(/);
  });

  it('does NOT pin its own compose model — that literal belongs to deepinfra.ts alone', () => {
    // The old harness carried `const MODEL = 'Qwen/Qwen3.5-35B-A3B'` beside the real
    // COMPOSE_MODEL. They were equal, and nothing made them stay equal.
    expect(code).not.toMatch(/Qwen\//);
    expect(code).not.toMatch(/\bconst\s+MODEL\s*=/);
  });

  it('does NOT define its own retry budget — MAX_RETRIES is teach-budget.ts territory', () => {
    // The old harness ran 1 retry where production runs 2, so the gate exercised a shorter loop
    // than the one that ships.
    expect(code).not.toMatch(/\bconst\s+MAX_RETRIES\s*=/);
  });

  it('does NOT issue its own retrieval SQL — that is how the legal-corpus filter got bypassed', () => {
    // The load-bearing one. Production retrieval applies LEGAL_CORPUS_FILTER (the license-verified
    // author allowlist); the old harness selected straight from `embeddings` with no such
    // predicate, so the faithfulness gate sampled a population the product does not serve.
    expect(code).not.toMatch(/FROM\s+embeddings/i);
    expect(code).not.toMatch(/\bsql\.query\s*\(/);
    expect(code).not.toMatch(/from\s+['"]@neondatabase\/serverless['"]/);
  });

  it('does NOT call the provider directly — no hand-rolled compose or embed', () => {
    expect(code).not.toMatch(/api\.deepinfra\.com/);
    expect(code).not.toMatch(/\bfunction\s+composeOnce\b/);
    expect(code).not.toMatch(/\bfunction\s+embedQuery\b/);
  });

  it('still judges output independently — the wide net is the harness\'s actual job', () => {
    // Guarding against over-correction: if the harness stops scanning assistant-voice text, it
    // becomes a run of teach() that reports nothing, which passes every check above.
    expect(code).toMatch(/WIDE_NET/);
    expect(code).toMatch(/runScreens/);
  });
});

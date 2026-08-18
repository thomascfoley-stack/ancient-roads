// The reopened-thread predicate carries the SAME provenance belt as its sibling (audit #6).
//
// `servedOf` (lib/research.ts) decides what a stored /ask/[id] thread may re-render. It checked
// `served` alone while `resolveServability` also rejects forbidden-aggregator provenance — so a
// dirty-but-served row re-rendered on a reopened thread where the identical row would tombstone
// inside a study. One rule, two strengths, split by surface: exactly the shape the pre-deploy
// audit's domain lens flagged.
//
// A STATIC PIN, stated as such: the belt is SQL inside a template literal, and an honest
// execution test needs a DB with a seeded dirty row (the DB-gated suites own that shape). What a
// static leg CAN hold is the clause's presence in the one function whose absence caused the
// finding — with the extraction asserted first, so a refactor that moves the function fails loud
// rather than leaving this green over nothing (the false-confidence trap).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

describe('servedOf carries the provenance belt', () => {
  it('the served predicate also rejects forbidden provenance, in the fail-closed spelling', () => {
    const src = readFileSync(join(__dirname, '../../src/lib/research.ts'), 'utf8');
    const fn = src.match(/export async function servedOf[\s\S]*?\n\}/);
    expect(fn, 'servedOf not found — the extractor has gone blind, fix it').toBeTruthy();
    // SEED: strip the AND (...) clause -> RED.
    expect(fn![0]).toMatch(/user_id IS NULL AND e\.served\s*\n\s*AND \(e\.metadata->>'sourceUrl' IS NULL OR NOT EXISTS/);
    expect(fn![0]).toContain('FORBIDDEN_PROVENANCE_DOMAINS');
  });
});

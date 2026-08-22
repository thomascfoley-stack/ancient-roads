// THE one loader for the loud-skip manifest — single-sourced 2026-08-22 after its two copies
// disagreed about the format and the divergence cost a run: ci-skip-ceiling.mjs was taught
// NDJSON while ci-db-invariants-receipt.mjs kept the legacy whole-object JSON.parse, so the
// FIRST fully-accounted run in this repo's history printed "skip ceiling OK" and then died in
// the receipt with "Unexpected non-whitespace character after JSON" (run 32561891829). Two
// readers of one format is one reader too many.
//
// The writer (web/test/helpers/loud-skip.ts recordArtifactSkip) appends ONE JSON object per
// line — atomic under vitest's parallel workers, which is why the format exists at all: the
// old read-modify-write single object LOST records to a last-writer-wins race.
//
// Accepted shapes, decided by SHAPE never by first character (every NDJSON file starts with
// '{', so a first-char test silently swallowed one-record manifests into the legacy branch):
//   * legacy whole-object: { artifactSkips: [...] }  -> its array
//   * a single record:     { check, suiteFile, ... } -> [it]
//   * NDJSON:              one record per line; torn lines dropped, never a crash
import { existsSync, readFileSync } from 'node:fs';

export function loadArtifactSkips(manifestPath) {
  if (!manifestPath || !existsSync(manifestPath)) return [];
  const raw = readFileSync(manifestPath, 'utf8').trim();
  if (raw === '') return [];
  try {
    const whole = JSON.parse(raw);
    if (Array.isArray(whole?.artifactSkips)) return whole.artifactSkips;
    if (whole && typeof whole === 'object' && whole.check && whole.suiteFile) return [whole];
  } catch { /* NDJSON with 2+ lines — parse per line below */ }
  const records = [];
  for (const line of raw.split('\n')) {
    const t = line.trim();
    if (!t) continue;
    try { records.push(JSON.parse(t)); } catch { /* a torn line is dropped, never a crash */ }
  }
  return records;
}

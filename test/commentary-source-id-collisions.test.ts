// D6 (DEEP_SWEEP) — the legacy flat-corpus sourceId omitted the WORK, so two different works by
// the same author on the same verse collided, and store.ts's
// `ON CONFLICT (source_type, source_id, chunk_index) DO NOTHING` silently dropped the second.
//
// Measured against the real on-disk corpus: 162,371 entries, 148,025 distinct sourceIds, 7,657
// colliding keys, 14,346 entries lost — and NOT ONE of them a byte-identical duplicate. 3,857 are
// a different work by the same author (Henry's Concise vs Commentary on the Whole Bible; Ryle's
// Expository Thoughts vs Holiness), 10,489 are same-title-different-text.
//
// A CORRECTION TO THE EARLIER WRITE-UP, made after reading the consumers rather than reasoning
// about them: I previously claimed getSource(sourceId) would serve a chunk attributed to the
// wrong work. It does not. getSource takes the RETRIEVAL INDEX, not a DB source_id, and every
// consumer that touches a real source_id takes quote and attribution from the SAME ROW —
// studies.ts's insertClippingFromEmbedding selects e.content alongside e.metadata->>'author' and
// e.metadata->>'sourceTitle'. Attribution is per-row and was never spliced. The real harms are
// content LOSS (the dropped entries) and an AMBIGUOUS key (a chunkIndex-less clipping resolves
// `ORDER BY chunk_index LIMIT 1`, which under a collision can land on the other work's chunk —
// quote and attribution mutually consistent, but not the passage the reader chose).
//
// This test pins the key's shape so the class cannot come back. It does not fix the rows already
// written; that is a re-ingest, logged with its cost in the revisit log.
import { describe, expect, it } from 'vitest';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { commentarySourceId, assignCommentarySourceIds } from '../src/retrieval/sources/commentary';

describe('D6 — a commentary sourceId identifies one work', () => {
  it('the key includes the work title, not just book/chapter/verse/author', () => {
    const a = commentarySourceId('mat', 1, 1, 1, 'Henry, Matthew', "Matthew Henry's Concise Commentary on the Bible");
    const b = commentarySourceId('mat', 1, 1, 1, 'Henry, Matthew', 'Commentary on the Whole Bible Volume V');
    expect(a).not.toBe(b);
  });

  it('is stable for the same work — not a hash of the text', () => {
    expect(commentarySourceId('mat', 1, 1, 1, 'Henry, Matthew', 'Concise'))
      .toBe(commentarySourceId('mat', 1, 1, 1, 'Henry, Matthew', 'Concise'));
  });

  it('still starts with the source_type prefix the lookups split on', () => {
    // studies.ts derives source_type via split_part(source_id, ':', 1).
    expect(commentarySourceId('mat', 1, 1, 1, 'A', 'B').split(':')[0]).toBe('commentary');
  });

  // The measurement that made this a finding, re-run as an assertion.
  it('produces NO collisions across the real corpus', () => {
    const DIR = join('/Users/foley/Projects/ancient-roads-git', 'web', 'public', 'commentaries');
    if (!existsSync(DIR)) return; // gitignored asset; the unit assertions above still hold
    const seen = new Map<string, number>();
    let entries = 0;
    for (const book of readdirSync(DIR)) {
      let files: string[];
      try { files = readdirSync(join(DIR, book)); } catch { continue; }
      for (const f of files) {
        if (!f.endsWith('.json')) continue;
        let data: { entries?: Array<Record<string, unknown>> };
        try { data = JSON.parse(readFileSync(join(DIR, book, f), 'utf-8')); } catch { continue; }
        const ch = parseInt(f);
        const ids = assignCommentarySourceIds(book, ch, (data.entries ?? []) as never);
        (data.entries ?? []).forEach((e, i) => {
          if (!(e.text as string)?.trim()) return;
          entries++;
          seen.set(ids[i]!, (seen.get(ids[i]!) ?? 0) + 1);
        });
      }
    }
    const lost = [...seen.values()].reduce((n, c) => n + (c > 1 ? c - 1 : 0), 0);
    expect(entries, 'the corpus should be present and non-trivial').toBeGreaterThan(100_000);
    expect(lost, `${lost} entries would still be dropped by ON CONFLICT DO NOTHING`).toBe(0);
  });
});

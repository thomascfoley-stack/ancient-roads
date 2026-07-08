import type { Embedder, EmbeddingRow, EmbeddingStore, RankedRow, SearchOpts } from '../src/retrieval/types';

// Deterministic embedder: normalized bag-of-words hashing, so texts sharing words
// land near each other in cosine space. Enough to assert ranking/limit/filter
// behavior hermetically — real semantic quality is the integration test's job.
export function fakeEmbedder(dims = 1024): Embedder {
  return {
    model: 'fake',
    dims: dims as 1024,
    async embed(texts: string[]): Promise<number[][]> {
      return texts.map((t) => {
        const v = new Array<number>(dims).fill(0);
        for (const w of t.toLowerCase().split(/\W+/).filter(Boolean)) {
          let h = 0;
          for (let i = 0; i < w.length; i++) h = (h * 31 + w.charCodeAt(i)) >>> 0;
          const idx = h % dims;
          v[idx] = (v[idx] ?? 0) + 1;
        }
        const norm = Math.sqrt(v.reduce((s, x) => s + x * x, 0)) || 1;
        return v.map((x) => x / norm);
      });
    },
  };
}

// In-memory EmbeddingStore: brute-force cosine. The second impl of the interface,
// which is exactly what the seam pays for — it makes the contract testable with
// no DB or network.
export function inMemoryStore(): EmbeddingStore & { readonly rows: EmbeddingRow[] } {
  const rows: EmbeddingRow[] = [];
  const key = (r: Pick<EmbeddingRow, 'sourceType' | 'sourceId' | 'chunkIndex'>) =>
    `${r.sourceType}|${r.sourceId}|${r.chunkIndex}`;

  const cosine = (a: number[], b: number[]): number => {
    let dot = 0;
    let na = 0;
    let nb = 0;
    const n = Math.min(a.length, b.length);
    for (let i = 0; i < n; i++) {
      const ai = a[i] ?? 0;
      const bi = b[i] ?? 0;
      dot += ai * bi;
      na += ai * ai;
      nb += bi * bi;
    }
    return dot / (Math.sqrt(na) * Math.sqrt(nb) || 1);
  };

  return {
    rows,
    async upsert(newRows: EmbeddingRow[]): Promise<{ inserted: number; skipped: number }> {
      const seen = new Set(rows.map(key));
      let inserted = 0;
      let skipped = 0;
      for (const r of newRows) {
        if (seen.has(key(r))) {
          skipped++;
          continue;
        }
        rows.push(r);
        seen.add(key(r));
        inserted++;
      }
      return { inserted, skipped };
    },
    async search(queryVector: number[], opts: SearchOpts): Promise<RankedRow[]> {
      return rows
        .filter((r) => !opts.sourceType || r.sourceType === opts.sourceType)
        .map((r): RankedRow => ({
          sourceId: r.sourceId,
          score: cosine(queryVector, r.embedding),
          content: r.content,
          metadata: r.metadata,
        }))
        .sort((a, b) => b.score - a.score)
        .slice(0, opts.limit);
    },
  };
}

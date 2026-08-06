// The only writer of user_sections / user_section_embeddings / user_section_anchors.
//
// ONE TRANSACTION PER DOCUMENT. `runAsUser` takes a static array of queries and runs them in a
// single transaction, so either a document is fully indexed or none of it is. A partial write would
// leave sections with no embeddings — searchable by FTS, invisible to semantic search, and
// reporting `ready`. Half-indexed is the shape of a document that looks fine and answers wrong.
//
// IDS ARE GENERATED HERE, not by the database default, because the embeddings and anchors reference
// the section ids and all three inserts must be built before any of them runs. The columns are TEXT
// precisely so a client can mint them (SLICE_1_DATA_MODEL: "opaque, client- or server-generatable").

import { randomUUID } from 'node:crypto';
import { runAsUser } from '@/lib/db';
import type { Anchor } from './anchor';
import type { Chunk } from './chunk';
import { EMBEDDING_DB_SLUG, EMBEDDING_DIMS } from './model';

export interface StoredSection {
  chunk: Chunk;
  anchors: Anchor[];
  embedding: number[];
}

export interface StoreResult {
  sections: number;
  embeddings: number;
  anchors: number;
}

/** pgvector literal. Kept explicit so a NaN or a wrong width fails here, not inside Postgres. */
function toVectorLiteral(v: number[]): string {
  if (v.length !== EMBEDDING_DIMS) {
    throw new Error(`vector has ${v.length} dims, expected ${EMBEDDING_DIMS}`);
  }
  for (const x of v) {
    if (!Number.isFinite(x)) throw new Error('vector contains a non-finite value');
  }
  return `[${v.join(',')}]`;
}

/**
 * Write a document's chunks, their vectors and their anchors.
 *
 * Replaces whatever was there: a retry re-indexes rather than duplicating. The delete cascades to
 * embeddings and anchors, so it is one statement, and it runs inside the same transaction as the
 * inserts — a retry that deleted and then failed to insert would leave the document empty and
 * `ready`.
 */
export async function storeSections(
  userId: string,
  documentId: string,
  sections: StoredSection[],
): Promise<StoreResult> {
  const ids = sections.map(() => randomUUID());

  const secIds: string[] = [];
  const secOrdinals: number[] = [];
  const secHeadings: (string | null)[] = [];
  const secBodies: string[] = [];
  const secKinds: string[] = [];
  const embIds: string[] = [];
  const embVectors: string[] = [];
  const anchSecIds: string[] = [];
  const anchStarts: number[] = [];
  const anchEnds: number[] = [];
  const anchChannels: string[] = [];
  const anchCounts: (number | null)[] = [];
  const anchConfidences: number[] = [];

  sections.forEach((s, i) => {
    const id = ids[i]!;
    secIds.push(id);
    secOrdinals.push(s.chunk.ordinal);
    secHeadings.push(s.chunk.heading ?? null);
    secBodies.push(s.chunk.text);
    secKinds.push(s.chunk.kind);
    embIds.push(id);
    embVectors.push(toVectorLiteral(s.embedding));
    for (const a of s.anchors) {
      anchSecIds.push(id);
      anchStarts.push(a.verseStart);
      anchEnds.push(a.verseEnd);
      anchChannels.push(a.channel);
      anchCounts.push(a.matchCount);
      anchConfidences.push(a.confidence);
    }
  });

  await runAsUser(userId, (sql) => [
    // Idempotent re-index. The FK cascade takes embeddings and anchors with it.
    sql`DELETE FROM user_sections WHERE user_id = ${userId} AND document_id = ${documentId}`,

    sql`INSERT INTO user_sections (id, document_id, user_id, ordinal, heading, body, kind)
        SELECT t.id, ${documentId}, ${userId}, t.ordinal, t.heading, t.body, t.kind
          FROM unnest(${secIds}::text[], ${secOrdinals}::int[], ${secHeadings}::text[],
                      ${secBodies}::text[], ${secKinds}::text[])
               AS t(id, ordinal, heading, body, kind)`,

    sql`INSERT INTO user_section_embeddings (section_id, user_id, model_slug, embedding)
        SELECT t.id, ${userId}, ${EMBEDDING_DB_SLUG}, t.vec::vector
          FROM unnest(${embIds}::text[], ${embVectors}::text[]) AS t(id, vec)`,

    sql`INSERT INTO user_section_anchors
          (section_id, user_id, verse_id_start, verse_id_end, channel, match_count, confidence)
        SELECT t.id, ${userId}, t.vstart, t.vend, t.channel, t.mcount, t.conf
          FROM unnest(${anchSecIds}::text[], ${anchStarts}::int[], ${anchEnds}::int[],
                      ${anchChannels}::text[], ${anchCounts}::int[], ${anchConfidences}::real[])
               AS t(id, vstart, vend, channel, mcount, conf)`,
  ]);

  return { sections: secIds.length, embeddings: embIds.length, anchors: anchSecIds.length };
}

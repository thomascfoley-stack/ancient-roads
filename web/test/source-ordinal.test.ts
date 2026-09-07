// The sourceId -> section ordinal parse that lets an /ask result card deep-link into the reader.
//
// Two sourceId shapes exist in `embeddings`. Register works (register-writer.ts) write
// `${type}:${slug}:${ordinal}[.${chunk}]`, where the ordinal IS `sections.ordinal`. Classic
// commentaries (source-id.ts) write `commentary:{book}:{ch}:{vs}-{ve}:{author}` — five parts,
// no section id at all — and must resolve through the anchors table instead (locateSections).
// The parser must never mistake the second shape for the first: `commentary:jhn:3:16-16:…` is
// NOT "ordinal 3 of work jhn".
import { describe, expect, it } from 'vitest';
import { sectionOrdinalFromSourceId } from '@/lib/source-ordinal';

describe('sectionOrdinalFromSourceId', () => {
  it('reads the ordinal off a register-work sourceId, with or without a chunk suffix', () => {
    expect(sectionOrdinalFromSourceId('sermon:spurgeon-sermons:412.2')).toBe(412);
    expect(sectionOrdinalFromSourceId('hymn:olney-hymns:7')).toBe(7);
    expect(sectionOrdinalFromSourceId('commentary:matthew-henry:9')).toBe(9);
  });

  it('returns null for a classic commentary sourceId, which carries no section id', () => {
    expect(sectionOrdinalFromSourceId('commentary:jhn:3:16-16:Matthew Henry')).toBeNull();
  });

  it('returns null for a zero ordinal, empty input, and every other shape', () => {
    expect(sectionOrdinalFromSourceId('sermon:x:0')).toBeNull();
    expect(sectionOrdinalFromSourceId('')).toBeNull();
    expect(sectionOrdinalFromSourceId('sermon:x')).toBeNull();
    expect(sectionOrdinalFromSourceId('sermon:x:abc')).toBeNull();
    expect(sectionOrdinalFromSourceId('sermon:x:12.')).toBeNull();
    expect(sectionOrdinalFromSourceId('sermon:x:-3')).toBeNull();
    expect(sectionOrdinalFromSourceId('sermon:x:1.2.3')).toBeNull();
  });
});

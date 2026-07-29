// The manifest may not launder by rename (SECTION_PROVENANCE_DESIGN R4).
//
// The defect this closes, found by measurement on a fresh prod fork (2026-07-28):
// "Barnes' Notes" was claimed by TWO manifest entries — `barnes-notes` (quarantined,
// provenance biblehub, honest) and `barnes-crosswire-nt` (not quarantined, provenance
// crosswire.org). E2 labels those 1,300 flat rows with the quarantined slug; E4 sliced
// the same 1,300 rows into the non-quarantined one. Quarantined content re-entered the
// sections store under a clean name — the same laundering defect the slice's row-level
// checks close, expressed one level up, in the manifest itself.
//
// These rules are static (no DB), so they run everywhere `npm run test` runs and fail
// the moment an entry is edited into the laundering shape, not at cutover time.
import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

interface Entry {
  id: string;
  quarantine?: string;
  backfill?: {
    match_author?: string;
    forbidden_provenance?: string;
    forbidden_provenance_reason?: string;
  };
}

const manifest = JSON.parse(
  readFileSync(path.join(ROOT, 'ingest/sources.config.json'), 'utf8'),
) as Entry[];

const withAuthor = manifest.filter((e) => e.backfill?.match_author);
const byAuthor = new Map<string, Entry[]>();
for (const e of withAuthor) {
  const a = e.backfill!.match_author!;
  byAuthor.set(a, [...(byAuthor.get(a) ?? []), e]);
}

describe('manifest provenance invariants (SECTION_PROVENANCE_DESIGN R3/R4)', () => {
  it('two NON-quarantined entries never share a match_author', () => {
    // If they did, E2's first-entry-wins labeling and E4's author-keyed slice would
    // write the same flat rows under two sources, and the per-slug 1:1 check exempts
    // the second because its flat count under its own slug is 0.
    for (const [author, entries] of byAuthor) {
      const open = entries.filter((e) => !e.quarantine);
      expect(
        open.length,
        `match_author "${author}" is claimed by ${open.length} non-quarantined entries (${open.map((e) => e.id).join(', ')}) — the slice would write the same flat rows under both`,
      ).toBeLessThanOrEqual(1);
    }
  });

  it('a non-quarantined entry sharing a match_author with a QUARANTINED one declares forbidden_provenance', () => {
    // The quarantine on one entry is a ruling about the CONTENT; a twin entry with a
    // clean declared provenance must not become the door that content walks back
    // through. Declaring the policy is what makes the twin's behaviour explicit.
    for (const [author, entries] of byAuthor) {
      const quarantined = entries.filter((e) => e.quarantine);
      const open = entries.filter((e) => !e.quarantine);
      if (quarantined.length === 0) continue;
      for (const e of open) {
        expect(
          e.backfill?.forbidden_provenance,
          `"${e.id}" shares match_author "${author}" with quarantined ${quarantined.map((q) => q.id).join(', ')} but declares no backfill.forbidden_provenance — slicing it would relabel quarantined content into a non-quarantined slug`,
        ).toBeTruthy();
      }
    }
  });

  it('every declared forbidden_provenance is a known policy WITH a recorded reason', () => {
    for (const e of manifest) {
      const policy = e.backfill?.forbidden_provenance;
      if (policy === undefined) continue;
      expect(['exclude', 'skip'], `"${e.id}": forbidden_provenance="${policy}" is not exclude|skip`).toContain(policy);
      expect(
        e.backfill?.forbidden_provenance_reason?.trim(),
        `"${e.id}": forbidden_provenance="${policy}" has no forbidden_provenance_reason — a policy nobody can audit is a ruling nobody made`,
      ).toBeTruthy();
    }
  });
});

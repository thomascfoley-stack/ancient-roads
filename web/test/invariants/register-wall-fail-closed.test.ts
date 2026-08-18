// The register wall FAILS CLOSED — an unknown register is never an exegetical voice.
//
// FINDING (QA fleet 2026-08-17, domain lens #9): `registerLane` in commentary-panel.tsx
// ended `default: return 'exegetical'`, so any register nobody wired a lane for fell INTO
// the exegetical voice pool, got a voice slot, and counted toward the >=2-voices floor.
// `historian` is a LIVE register in this build (teacher/routing.ts) whose own lane note
// says "never doctrine, never part of the composed answer" — and the reader wall would
// have rendered it as plain commentary. Fail-open by construction.
//
// The reader renders exactly four sections (RegisterLaneSections: sermon, theology,
// song/verse — plus the exegetical voices above them). There is NO historian section, so
// the honest fail-closed behaviour is to EXCLUDE such entries from every section, not to
// invent a lane for them. These tests pin that, and pin the admissions the corpus
// actually depends on (measured over all 1,212 chapter files, 2026-08-17: register absent
// 99,410 · commentary 14,074 · father 6,009 are the ONLY exegetical populations).
//
// Red-proof: this file was written first and watched FAIL against the fail-open
// `default: return 'exegetical'` (historian + every unknown register classified
// 'exegetical' and landed in partition.exegetical), then the allowlist fix made it green.
import { describe, expect, it } from 'vitest';
import { isLaneWork, partitionByRegister, registerLane } from '@/components/commentary-panel';

// Minimal entry shape — the classifier reads ONLY `register` (by signature), so the wall
// cannot be quietly re-keyed on another field without this file noticing the type change.
const entry = (register?: string): { register?: string } => (register === undefined ? {} : { register });

// Registers with NO reader lane: `historian` (live in routing.ts, zero corpus rows by
// design) plus the three the 2026-08-17 census found riding the fail-open default —
// topical_index (11,952 rows) / devotional (1,908) / lexicon (91) — plus a stand-in for
// any future register nobody has wired yet.
const LANELESS = ['historian', 'topical_index', 'devotional', 'lexicon', 'register_invented_tomorrow'];

describe('register wall — fail closed (commentary-panel classifier)', () => {
  it('a historian entry NEVER lands among the exegetical voices', () => {
    expect(registerLane(entry('historian'))).not.toBe('exegetical');
    const p = partitionByRegister([entry('historian')]);
    expect(p.exegetical, 'historian took an exegetical voice slot').toHaveLength(0);
  });

  it('a historian entry is EXCLUDED, not mislabeled into another rendered section', () => {
    const p = partitionByRegister([entry('historian')]);
    expect(p.sermon).toHaveLength(0);
    expect(p.theology).toHaveLength(0);
    expect(p.songVerse).toHaveLength(0);
  });

  it('NO laneless or unknown register ever reaches ANY rendered section', () => {
    for (const r of LANELESS) {
      expect(registerLane(entry(r)), `registerLane('${r}')`).not.toBe('exegetical');
      const p = partitionByRegister([entry(r)]);
      expect(p.exegetical, `'${r}' took an exegetical voice slot`).toHaveLength(0);
      expect(p.sermon, `'${r}' rendered under Sermons`).toHaveLength(0);
      expect(p.theology, `'${r}' rendered under Theology & confessions`).toHaveLength(0);
      expect(p.songVerse, `'${r}' rendered under Hymns & sacred poetry`).toHaveLength(0);
    }
  });

  // The other half of fail-closed: the fix must not blank the reader. These are the ONLY
  // register values the exegetical corpus carries (census above) — pin every one.
  it('commentary / father / legacy no-register rows STILL land in exegetical', () => {
    expect(registerLane(entry('commentary'))).toBe('exegetical');
    expect(registerLane(entry('father'))).toBe('exegetical');
    expect(registerLane(entry())).toBe('exegetical'); // legacy rows predate the register column
    const p = partitionByRegister([entry('commentary'), entry('father'), entry()]);
    expect(p.exegetical).toHaveLength(3);
  });

  it('the labeled lanes are untouched: sermon / theology+confession / hymn+poetry', () => {
    const p = partitionByRegister([
      entry('sermon'),
      entry('theology'),
      entry('confession'),
      entry('hymn'),
      entry('poetry'),
    ]);
    expect(p.sermon).toHaveLength(1);
    expect(p.theology).toHaveLength(2);
    expect(p.songVerse).toHaveLength(2);
    expect(p.exegetical).toHaveLength(0);
  });

  // today.ts excludes lane works from the Today voice floor via isLaneWork. An excluded
  // register is NOT a lane work (it renders nowhere at all); Today's protection against
  // e.g. historian is isPublishedCommentaryEntry (no historian work is in PUBLISHED_WORKS)
  // plus the exclusion pinned above. Pin isLaneWork so its meaning cannot silently widen.
  it('isLaneWork still names exactly the sermon + theology lanes', () => {
    expect(isLaneWork(entry('sermon'))).toBe(true);
    expect(isLaneWork(entry('theology'))).toBe(true);
    expect(isLaneWork(entry('confession'))).toBe(true);
    expect(isLaneWork(entry('hymn'))).toBe(false);
    expect(isLaneWork(entry('historian'))).toBe(false);
    expect(isLaneWork(entry())).toBe(false);
  });
});

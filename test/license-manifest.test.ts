// Gate B unit tests — the pure license/provenance validator.
//
// A licensing violation is legally irreversible, so this validator is the
// fail-closed core: anything not unambiguously Public Domain / CC BY / CC BY-SA
// with full provenance must be reported. These tests pin that behaviour
// (especially the edition-trap guard: a PD author with a post-1929 translation
// is NOT allowed, so year/edition are required). Runs in `npm run audit`.

import { describe, expect, it } from 'vitest';
import {
  isAllowedLicense,
  validateManifest,
  type SourceManifestEntry,
} from '../src/ingest/license-manifest';

const validEntry: SourceManifestEntry = {
  id: 'mhc-genesis',
  title: "Matthew Henry's Complete Commentary — Genesis",
  author: 'Matthew Henry',
  license: 'Public Domain',
  provenance: { url: 'https://ccel.org/ccel/henry/mhc1', edition: 'Complete, 1706', year: 1706 },
};

describe('isAllowedLicense', () => {
  it('accepts exactly the three allowed licenses', () => {
    expect(isAllowedLicense('Public Domain')).toBe(true);
    expect(isAllowedLicense('CC BY')).toBe(true);
    expect(isAllowedLicense('CC BY-SA')).toBe(true);
  });
  it('rejects near-miss and non-commercial licenses', () => {
    expect(isAllowedLicense('CC BY-NC')).toBe(false);
    expect(isAllowedLicense('CC BY-ND')).toBe(false);
    expect(isAllowedLicense('CC BY-NC-SA')).toBe(false);
    expect(isAllowedLicense('public domain')).toBe(false); // case-sensitive on purpose
  });
  it('rejects empty / non-string', () => {
    expect(isAllowedLicense('')).toBe(false);
    expect(isAllowedLicense(undefined)).toBe(false);
    expect(isAllowedLicense(null)).toBe(false);
    expect(isAllowedLicense(42)).toBe(false);
  });
});

describe('validateManifest', () => {
  it('passes a fully-specified, allowed-license source', () => {
    expect(validateManifest([validEntry])).toEqual([]);
  });

  it('accepts a string year (e.g. "c. 1871")', () => {
    const entry = { ...validEntry, provenance: { ...validEntry.provenance, year: 'c. 1871' } };
    expect(validateManifest([entry])).toEqual([]);
  });

  it('fails closed when the root is not an array', () => {
    const v = validateManifest({ id: 'x' });
    expect(v).toHaveLength(1);
    expect(v[0]!.reason).toMatch(/must be a JSON array/);
  });

  it('flags a missing license (fail closed → quarantine)', () => {
    const noLicense = { id: validEntry.id, title: validEntry.title, author: validEntry.author, provenance: validEntry.provenance };
    const v = validateManifest([noLicense]);
    expect(v.some((x) => x.id === 'mhc-genesis' && /license is missing/.test(x.reason))).toBe(true);
  });

  it('flags a disallowed license as not in the allowed set', () => {
    const v = validateManifest([{ ...validEntry, license: 'CC BY-NC' }]);
    expect(v.some((x) => /not in the allowed set/.test(x.reason))).toBe(true);
  });

  it('enforces the edition trap: url, edition, and year are all required', () => {
    const noProv = { id: validEntry.id, title: validEntry.title, author: validEntry.author, license: validEntry.license };
    expect(validateManifest([noProv]).some((x) => /missing provenance object/.test(x.reason))).toBe(true);

    const partial = { ...validEntry, provenance: { url: '', edition: '', year: '' } };
    const reasons = validateManifest([partial]).map((x) => x.reason).join(' | ');
    expect(reasons).toMatch(/provenance\.url/);
    expect(reasons).toMatch(/provenance\.edition/);
    expect(reasons).toMatch(/provenance\.year/);
  });

  it('flags duplicate ids', () => {
    const v = validateManifest([validEntry, { ...validEntry }]);
    expect(v.some((x) => x.reason === 'duplicate id')).toBe(true);
  });

  it('flags missing id / title / author', () => {
    const v = validateManifest([{ license: 'Public Domain', provenance: validEntry.provenance }]);
    const reasons = v.map((x) => x.reason).join(' | ');
    expect(reasons).toMatch(/id is missing/);
    expect(reasons).toMatch(/title is missing/);
    expect(reasons).toMatch(/author is missing/);
  });

  it('flags a non-object entry', () => {
    expect(validateManifest([null]).some((x) => /entry is not an object/.test(x.reason))).toBe(true);
  });

  it('reports every violation, not just the first', () => {
    // A single entry that is wrong in multiple independent ways.
    const bad = { id: 'bad', title: '', author: '', license: 'CC BY-NC', provenance: null };
    const v = validateManifest([bad]);
    expect(v.length).toBeGreaterThanOrEqual(4);
  });
});

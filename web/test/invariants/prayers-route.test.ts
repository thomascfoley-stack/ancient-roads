// PR1a — the prayer route's boundaries. Exit tests, no DB required.
//
// Asserts the properties the pre-deploy audit found missing across this API surface: a body cap
// (A1-8: only the bookmark label was capped), and auth failure distinguished from server failure
// (A1-16: four routes wrapped requireUser and the DB call in ONE try, so an RLS refusal — the
// condition the whole isolation design exists to produce — was indistinguishable from "signed out").

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const route = () => readFileSync(path.join(SRC, 'app/api/prayers/route.ts'), 'utf8');

describe('PR1a — prayer route boundaries', () => {
  // SEED: delete the length check -> RED.
  it('caps the body at the edge', () => {
    expect(route(), 'an uncapped text column is a cheap way to fill a database').toMatch(/PRAYER_MAX_LENGTH/);
  });

  // SEED: wrap requireUser and the DB call in one try -> RED.
  it('does not conflate auth failure with server failure', () => {
    const src = route();
    // requireUser must sit in its own try whose catch returns UNAUTHENTICATED and nothing else.
    // D43: the catch now answers through authFailureResponse, which tells an auth-SERVICE
    // outage (503) from an absent session (401). The PROPERTY this asserts is unchanged —
    // requireUser must still be caught ALONE — so only the accepted response helper widened.
    const solo = /try\s*\{\s*user = await requireUser\(\);\s*\}\s*catch\s*(?:\(e\)\s*)?\{\s*return (?:apiError\('UNAUTHENTICATED'\)|authFailureResponse\(e\));\s*\}/g;
    const occurrences = (src.match(solo) ?? []).length;
    expect(occurrences, 'requireUser must be caught alone — audit A1-16').toBeGreaterThanOrEqual(2);
    expect(src, 'no catch may return UNAUTHENTICATED for a DB failure').not.toMatch(/catch[\s\S]{0,120}console\.error[\s\S]{0,120}UNAUTHENTICATED/);
    expect(src, 'nor may it answer a DB failure through the auth helper').not.toMatch(/catch[\s\S]{0,120}console\.error[\s\S]{0,120}authFailureResponse/);
  });

  it('never logs the prayer body', () => {
    // C9's third route: an error payload is a leak like any other.
    const logs = route().match(/console\.error\([^)]*\)/g) ?? [];
    expect(logs.length, 'expected error logging to exist at all').toBeGreaterThan(0);
    for (const l of logs) {
      expect(l, `this log could carry prayer text: ${l}`).not.toMatch(/\btext\b|body\.body|prayer\.body/);
    }
  });

  it('validates ids as UUIDs before touching the database', () => {
    expect(route()).toMatch(/UUID_RE/);
  });
});

// D34 (DEEP_SWEEP) — docs/API_ERRORS.md: "Retry-After is required on every 429 … so clients back
// off instead of hammering a paid endpoint." The three user-corpus 429s carried retryAfterSec in
// the BODY and no header. These are exactly the paid endpoints (embedding spend); the sibling
// routes that answer through apiError get the header for free, which is why the gap survived.
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const ROUTES = [
  'app/api/user-corpus/upload/route.ts',
  'app/api/user-corpus/documents/[id]/route.ts',
  'app/api/user-corpus/documents/[id]/readings/route.ts',
];

describe('D34 — every user-corpus 429 carries Retry-After', () => {
  // A source check, and named as one: these handlers need a live limiter and a real user to
  // reach their 429 branch, so invoking them would test the mock, not the route.
  it.each(ROUTES)('%s', (rel) => {
    const src = readFileSync(path.join(SRC, rel), 'utf8');
    const status429 = src.match(/\{\s*status:\s*429[^}]*\}/g) ?? [];
    expect(status429.length, 'expected a 429 branch to exist at all').toBeGreaterThan(0);
    for (const init of status429) {
      expect(init, `429 without Retry-After in ${rel}`).toMatch(/'Retry-After'/);
    }
  });
});

// Every adapter that constructs a RegisterWork must gate at its own mouth.
//
// WHY THIS EXISTS, and it is a criticism of the test that preceded it. D2's guard
// (test/quarantine-register-path.test.ts) asserts `assertNotQuarantined` throws for the
// quarantined manifest entries that carry an adapter — i.e. it tests the HELPER. It also has two
// mouth tests, but only for acquireCcel and acquireGutenberg, the two adapters that were fixed.
// adapter-helloao.ts constructs a RegisterWork too, calls no quarantine check at all, and left
// that suite entirely green (DEEP_SWEEP D25). An extraction whose match set is narrower than the
// property it claims — the mirror image of the watchlist's usual failure.
//
// helloao has no exported entry point (it is a top-level main() script), so a mouth test in the
// D2 style is not writable without refactoring the file. The repo's precedent for exactly that
// situation is a source-position scan (test/invariants/reingest-guard-wiring.test.ts). Named as a
// source check, deliberately, and it covers ALL adapters rather than the two someone remembered.
import { describe, expect, it } from 'vitest';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const IN = join(import.meta.dirname, '..', '..', 'src', 'ingest');
const adapters = readdirSync(IN)
  .filter((f) => /^adapter-.*\.(ts|mts)$/.test(f))
  .map((f) => [f, readFileSync(join(IN, f), 'utf8')] as const)
  .filter(([, src]) => /RegisterWork\b/.test(src) && /writeRegisterWork\s*\(/.test(src));

describe('adapters that write a RegisterWork gate at the mouth', () => {
  it('there is at least one such adapter to check (the scan is not vacuously empty)', () => {
    expect(adapters.map(([f]) => f).sort()).toEqual(
      ['adapter-ccel.ts', 'adapter-gutenberg.ts', 'adapter-helloao.ts'],
    );
  });

  it.each(adapters.map(([f]) => f))('%s refuses a quarantined manifest entry', (f) => {
    const src = adapters.find(([n]) => n === f)![1];
    expect(src, `${f} constructs a RegisterWork but never calls assertNotQuarantined`)
      .toMatch(/assertNotQuarantined\s*\(/);
  });

  // The publish flag is the owner's gate. A literal `true` takes it away from them.
  it.each(adapters.map(([f]) => f))('%s never hardcodes publish: true', (f) => {
    const src = adapters.find(([n]) => n === f)![1];
    expect(src, `${f} hardcodes publish — the manifest serve flag and the owner cannot override it`)
      .not.toMatch(/publish:\s*true\b/);
  });
});

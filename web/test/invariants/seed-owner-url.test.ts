// The seeding suites INSERT and DELETE. `seedOwnerUrl()` decides which database they may do that
// to, so it is the guard standing between a fixture seed and production. Four suites used to
// hand-roll it; this proves the one shared definition.
//
// The property that must never regress: PRODUCTION IS REFUSED, LOUDLY — a throw, not a skip.
// A skip would turn "never seed on prod" into "did not run", which is the exact silence this
// repo has now been bitten by in three costumes (missing secret, skipping suite, unnamed file).

import { afterEach, describe, expect, it } from 'vitest';
import { endpointIdOf, runtimeDbUrl, seedOwnerUrl } from '../helpers/env';

const PROD = 'postgresql://neondb_owner:pw@ep-odd-fog-atnykudm.c-9.us-east-1.aws.neon.tech/neondb';
const DEV = 'postgresql://neondb_owner:pw@ep-tiny-hat-atdgpisx.c-9.us-east-1.aws.neon.tech/neondb';
const CI = 'postgresql://neondb_owner:pw@ep-tiny-bonus-at3izo3y.c-9.us-east-1.aws.neon.tech/neondb';

const saved = {
  db: process.env.DATABASE_URL,
  app: process.env.APP_DATABASE_URL,
  unpooled: process.env.DATABASE_URL_UNPOOLED,
  seed: process.env.SEED_TEST_ENDPOINT,
};
afterEach(() => {
  for (const [k, v] of [
    ['DATABASE_URL', saved.db],
    ['APP_DATABASE_URL', saved.app],
    ['DATABASE_URL_UNPOOLED', saved.unpooled],
    ['SEED_TEST_ENDPOINT', saved.seed],
  ] as const) {
    if (v === undefined) delete process.env[k]; else process.env[k] = v;
  }
});
function withEnv(url: string | undefined, declared?: string) {
  if (url === undefined) delete process.env.DATABASE_URL; else process.env.DATABASE_URL = url;
  delete process.env.APP_DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  if (declared === undefined) delete process.env.SEED_TEST_ENDPOINT; else process.env.SEED_TEST_ENDPOINT = declared;
}
function withAppEnv(url: string | undefined) {
  delete process.env.DATABASE_URL;
  delete process.env.DATABASE_URL_UNPOOLED;
  if (url === undefined) delete process.env.APP_DATABASE_URL; else process.env.APP_DATABASE_URL = url;
}

describe('seedOwnerUrl — which database a seeding suite may write to', () => {
  it('REFUSES production, loudly, and no declaration can override it', () => {
    withEnv(PROD);
    expect(() => seedOwnerUrl(), 'prod must throw, not skip').toThrow(/PRODUCTION/i);
    // the dangerous case: an operator "declares" prod to make the suite run
    withEnv(PROD, 'ep-odd-fog-atnykudm');
    expect(() => seedOwnerUrl(), 'declaring prod must NOT unlock it').toThrow(/PRODUCTION/i);
    // and uppercase, which `new URL()` does not normalise for postgresql:
    withEnv(PROD.replace('ep-odd-fog-atnykudm', 'EP-ODD-FOG-ATNYKUDM'));
    expect(() => seedOwnerUrl(), 'an uppercase prod host must still be refused').toThrow(/PRODUCTION/i);
  });

  it('allows dev and localhost with no declaration', () => {
    withEnv(DEV);
    expect(seedOwnerUrl()).toBe(DEV);
    withEnv('postgresql://u:p@localhost:5432/neondb');
    expect(seedOwnerUrl()).toBeDefined();
  });

  it('allows another endpoint ONLY when declared by exact id', () => {
    withEnv(CI);
    expect(seedOwnerUrl(), 'an undeclared endpoint must not be seeded').toBeUndefined();
    withEnv(CI, 'ep-tiny-bonus-at3izo3y');
    expect(seedOwnerUrl(), 'the declared endpoint is allowed').toBe(CI);
    // a substring declaration must not authorise it — the CUTOVER_EXPECT_HOST=neon.tech defect
    withEnv(CI, 'neon.tech');
    expect(seedOwnerUrl(), 'a generic domain must authorise nothing').toBeUndefined();
    withEnv(CI, 'ep-tiny-bonus');
    expect(seedOwnerUrl(), 'a prefix of an endpoint id is not that endpoint').toBeUndefined();
  });

  it('skips (undefined) when no URL is configured at all', () => {
    withEnv(undefined);
    // NOTE: falls through to web/.env.local on a dev laptop; in CI there is no such file.
    const r = seedOwnerUrl();
    expect(r === undefined || /ep-tiny-hat|localhost/.test(r)).toBe(true);
  });

  it('endpointIdOf rejects generic domains and accepts real ids', () => {
    expect(endpointIdOf('neon.tech')).toBeNull();
    expect(endpointIdOf('c-9.us-east-1.aws.neon.tech')).toBeNull();
    expect(endpointIdOf(undefined)).toBeNull();
    expect(endpointIdOf(CI)).toBe('ep-tiny-bonus-at3izo3y');
    expect(endpointIdOf('EP-TINY-BONUS-AT3IZO3Y')).toBe('ep-tiny-bonus-at3izo3y');
  });
});

describe('runtimeDbUrl — which database behavioral invariants may read', () => {
  it('REFUSES production via APP_DATABASE_URL (third instance of the second-door class)', () => {
    withAppEnv(PROD);
    expect(() => runtimeDbUrl(), 'prod APP_DATABASE_URL must throw, not connect').toThrow(/PRODUCTION/i);
    withAppEnv(PROD.replace('ep-odd-fog-atnykudm', 'EP-ODD-FOG-ATNYKUDM'));
    expect(() => runtimeDbUrl(), 'uppercase prod host must still be refused').toThrow(/PRODUCTION/i);
  });

  it('REFUSES production via DATABASE_URL fallback', () => {
    withAppEnv(undefined);
    process.env.DATABASE_URL = PROD;
    expect(() => runtimeDbUrl()).toThrow(/PRODUCTION/i);
  });

  it('allows dev endpoint for runtime invariants', () => {
    withAppEnv(DEV);
    expect(runtimeDbUrl()).toBe(DEV);
  });
});

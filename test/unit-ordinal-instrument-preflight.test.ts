import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as neonConn from '../scripts/lib/neon-connection.mjs';
import { instrumentTargetMatches, declaredMatches } from '../scripts/lib/target-guard.mjs';

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const PROD_URL =
  'postgresql://app_runtime:secret@ep-odd-fog-atnykudm-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';
const TEST_KEY = 'napi_test_key_for_redproof_only';

describe('§1 — NEON_API_KEY only, no URL fallback', () => {
  const orig = { ...process.env };

  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    process.env = { ...orig };
    delete process.env.UNIT_ORDINAL_DATABASE_URL;
    delete process.env.APP_DATABASE_URL;
    delete process.env.CUTOVER_DATABASE_URL;
    delete process.env.DATABASE_URL;
    delete process.env.NEON_API_KEY;
  });

  afterEach(() => {
    process.env = orig;
  });

  it('refuses when NEON_API_KEY unset even if DATABASE_URL is set', () => {
    process.env.DATABASE_URL = PROD_URL;
    process.env.APP_DATABASE_URL = PROD_URL;
    process.env.CUTOVER_DATABASE_URL = PROD_URL;
    process.env.UNIT_ORDINAL_DATABASE_URL = PROD_URL;
    expect(() => neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' })).toThrow(/NEON_API_KEY is required/);
  });

  it('mints with NEON_API_KEY only — argv has no --api-key', () => {
    process.env.NEON_API_KEY = TEST_KEY;
    vi.mocked(execFileSync).mockReturnValue(PROD_URL);
    neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' });
    const call = vi.mocked(execFileSync).mock.calls[0]!;
    expect(call[1]).not.toContain('--api-key');
    expect(call[1]).not.toContain(TEST_KEY);
    expect(call[2]?.env?.NEON_API_KEY).toBe(TEST_KEY);
  });
});

describe('§2 — scrubbed errors, no credential leak', () => {
  it('scrubCredentialText removes key and postgres URLs', () => {
    const msg = `failed --api-key ${TEST_KEY} postgres://user:pass@host/db`;
    const scrubbed = neonConn.scrubCredentialText(msg, TEST_KEY);
    expect(scrubbed).not.toContain(TEST_KEY);
    expect(scrubbed).not.toContain('postgres://');
    expect(scrubbed).toContain('--api-key [REDACTED]');
    expect(scrubbed).toContain('[REDACTED_DATABASE_URL]');
  });

  it('mint failure stderr contains no key or postgres URL', () => {
    process.env.NEON_API_KEY = TEST_KEY;
    const err = new Error('Command failed');
    (err as NodeJS.ErrnoException & { stderr: string; stdout: string }).stderr =
      `ERROR: auth failed --api-key ${TEST_KEY}\n${PROD_URL}`;
    (err as NodeJS.ErrnoException & { stdout: string }).stdout = PROD_URL;
    vi.mocked(execFileSync).mockImplementation(() => {
      throw err;
    });
    let thrown = '';
    try {
      neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' });
    } catch (e) {
      thrown = String((e as Error).message);
    }
    expect(thrown).not.toContain(TEST_KEY);
    expect(thrown).not.toMatch(/postgres:\/\//);
  });
});

describe('instrumentTargetMatches', () => {
  it('ep-odd-fog prefix matches full prod host', () => {
    expect(instrumentTargetMatches(PROD_URL, 'ep-odd-fog')).toBe(true);
  });

  it('declaredMatches alone does not match prod prefix', () => {
    expect(declaredMatches(PROD_URL, 'ep-odd-fog')).toBe(false);
  });
});

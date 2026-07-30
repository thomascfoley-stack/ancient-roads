import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { execFileSync } from 'node:child_process';
import * as neonConn from '../scripts/lib/neon-connection.mjs';
import * as uoiCore from '../scripts/lib/unit-ordinal-instrument.mjs';
import { instrumentTargetMatches, declaredMatches } from '../scripts/lib/target-guard.mjs';

const {
  pickExcerptSlugs,
  CLEAN_EXCERPT_WORKS_SQL,
  EXCERPT_SECTIONS_SQL,
  SOURCE_FORBIDDEN_PROVENANCE_SQL,
  FORBIDDEN_PROVENANCE_DOMAINS,
} = uoiCore;

vi.mock('node:child_process', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:child_process')>();
  return { ...actual, execFileSync: vi.fn(actual.execFileSync) };
});

const PROD_URL =
  'postgresql://app_runtime:secret@ep-odd-fog-atnykudm-pooler.us-east-1.aws.neon.tech/neondb?sslmode=require';

describe('unit_ordinal instrument preflight — neon URL mint', () => {
  const orig = { ...process.env };

  beforeEach(() => {
    vi.mocked(execFileSync).mockReset();
    process.env = { ...orig };
    delete process.env.UNIT_ORDINAL_DATABASE_URL;
    delete process.env.APP_DATABASE_URL;
    delete process.env.CUTOVER_DATABASE_URL;
    delete process.env.DATABASE_URL;
  });

  afterEach(() => {
    process.env = orig;
  });

  it('branchForTarget maps ep-odd-fog → production', () => {
    expect(neonConn.branchForTarget('ep-odd-fog')).toBe('production');
  });

  it('with NEON_API_KEY and no DATABASE_URL, mints and does not require env URL', () => {
    process.env.NEON_API_KEY = 'test-key';
    vi.mocked(execFileSync).mockReturnValue(PROD_URL);
    const r = neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog', role: 'app_runtime' });
    expect(r.source).toBe('neonctl');
    expect(r.role).toBe('app_runtime');
    expect(execFileSync).toHaveBeenCalledWith(
      'npx',
      expect.arrayContaining(['connection-string', 'production', '--role-name', 'app_runtime']),
      expect.any(Object),
    );
  });

  it('refuses when minted host is not the declared target', () => {
    process.env.NEON_API_KEY = 'test-key';
    vi.mocked(execFileSync).mockReturnValue(
      'postgresql://app_runtime:secret@ep-tiny-hat-atdgpisx-pooler.us-east-1.aws.neon.tech/neondb',
    );
    expect(() => neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' })).toThrow(/STOP.*not the declared target/);
  });

  it('refuses env URL when host does not match declared target', () => {
    process.env.APP_DATABASE_URL =
      'postgresql://app_runtime:secret@ep-tiny-hat-atdgpisx-pooler.us-east-1.aws.neon.tech/neondb';
    expect(() => neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' })).toThrow(/STOP.*not the declared target/);
  });

  it('mintNeonConnectionString return value is never logged by resolveInstrumentConnection', () => {
    process.env.NEON_API_KEY = 'test-key';
    vi.mocked(execFileSync).mockReturnValue(
      'postgresql://app_runtime:SUPERSECRET@ep-odd-fog-atnykudm-pooler.us-east-1.aws.neon.tech/neondb',
    );
    const logs: string[] = [];
    const origLog = console.log;
    console.log = (...a) => logs.push(String(a[0]));
    try {
      neonConn.resolveInstrumentConnection({ target: 'ep-odd-fog' });
    } finally {
      console.log = origLog;
    }
    expect(logs.join('\n')).not.toContain('SUPERSECRET');
  });
});

describe('unit_ordinal instrument preflight — excerpt policy', () => {
  it('EXCERPT_SECTIONS_SQL selects ordering fields only — no body text', () => {
    expect(EXCERPT_SECTIONS_SQL).toMatch(/unit_ordinal/);
    expect(EXCERPT_SECTIONS_SQL).toMatch(/heading/);
    expect(EXCERPT_SECTIONS_SQL).not.toMatch(/body/);
    expect(EXCERPT_SECTIONS_SQL).not.toMatch(/snippet/);
  });

  it('CLEAN_EXCERPT_WORKS_SQL excludes forbidden-provenance sources', () => {
    for (const d of FORBIDDEN_PROVENANCE_DOMAINS) {
      expect(CLEAN_EXCERPT_WORKS_SQL).toContain(d);
    }
    expect(CLEAN_EXCERPT_WORKS_SQL).toContain('NOT EXISTS');
    expect(SOURCE_FORBIDDEN_PROVENANCE_SQL).toContain('provenance');
  });

  it('pickExcerptSlugs takes first slug per register', () => {
    const slugs = pickExcerptSlugs([
      { slug: 'a-commentary', source_type: 'commentary' },
      { slug: 'b-commentary', source_type: 'commentary' },
      { slug: 'c-sermon', source_type: 'sermon' },
      { slug: 'd-bible', source_type: 'bible' },
    ]);
    expect(slugs).toEqual(['a-commentary', 'c-sermon', 'd-bible']);
  });

  it('RED when forbidden work would enter sample — clean query excludes it', () => {
    const rows = [
      { slug: 'forbidden-work', source_type: 'commentary' },
      { slug: 'clean-work', source_type: 'commentary' },
    ];
    const cleanOnly = rows.filter((r) => r.slug !== 'forbidden-work');
    const sample = pickExcerptSlugs(cleanOnly);
    expect(sample).not.toContain('forbidden-work');
    expect(sample).toContain('clean-work');
  });
});

describe('instrumentTargetMatches — prod prefix + exact fork id', () => {
  it('ep-odd-fog prefix matches full prod host (cutover STEP ZERO rule)', () => {
    expect(instrumentTargetMatches(PROD_URL, 'ep-odd-fog')).toBe(true);
  });

  it('exact endpoint id still matches forks', () => {
    const fork = 'postgresql://u:p@ep-fresh-fork-at000000.c-9.us-east-1.aws.neon.tech.invalid/db';
    expect(instrumentTargetMatches(fork, 'ep-fresh-fork-at000000')).toBe(true);
  });

  it('wrong endpoint fails', () => {
    const dev = 'postgresql://u:p@ep-tiny-hat-atdgpisx-pooler.us-east-1.aws.neon.tech/neondb';
    expect(instrumentTargetMatches(dev, 'ep-odd-fog')).toBe(false);
  });

  it('declaredMatches alone does not match prod prefix (documented limit)', () => {
    expect(declaredMatches(PROD_URL, 'ep-odd-fog')).toBe(false);
  });
});

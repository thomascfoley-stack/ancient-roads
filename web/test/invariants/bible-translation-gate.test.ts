// Deploy-gate detector test (T1§3). blockedBibleTranslations() is what predeploy-gate.ts uses
// to refuse shipping any translation dir whose license record doesn't permit it. This proves
// the detector blocks deny/unknown/no-record + conditional-without-ack, and passes allow — the
// file-side twin of the picker guard (translation-licensing.test.ts).
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { blockedBibleTranslations, presentBibleTranslations } from '../helpers/corpus-scan';

const tmp = mkdtempSync(path.join(tmpdir(), 'bibgate-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

function tree(name: string, dirs: string[]): string {
  const d = path.join(tmp, name);
  for (const t of dirs) mkdirSync(path.join(d, t), { recursive: true });
  return d;
}

describe('blockedBibleTranslations (deploy gate reads the license record)', () => {
  it('blocks deny + unknown + no-record dirs, passes allow ones', () => {
    // web/kjv/lsv = allow; mkjv = deny; jubilee = unknown→deny; zzz = no record.
    const d = tree('mix', ['web', 'kjv', 'lsv', 'mkjv', 'jubilee', 'zzz']);
    const blocked = blockedBibleTranslations(d).map((b) => b.id).sort();
    expect(blocked).toEqual(['jubilee', 'mkjv', 'zzz']);
  });

  it('passes a clean allow-only tree', () => {
    const d = tree('good', ['web', 'kjv', 'asv', 'ylt', 'lsv']);
    expect(blockedBibleTranslations(d)).toEqual([]);
  });

  it('blocks a conditional dir when unacknowledged (LEB without LICENSE_ACK)', () => {
    const d = tree('cond', ['web', 'leb']);
    // No LICENSE_ACK in the test env → leb (conditional) is blocked.
    expect(blockedBibleTranslations(d).map((b) => b.id)).toEqual(['leb']);
  });

  it('presentBibleTranslations lists all dirs, licensed or not', () => {
    const d = tree('all', ['web', 'mkjv']);
    expect(presentBibleTranslations(d).sort()).toEqual(['mkjv', 'web']);
  });
});

// Deploy-gate detector test (LONG_NIGHT C1/H5). findForbiddenBibleTranslations() is what
// predeploy-gate.ts uses to refuse shipping copyrighted Scripture from public/bible/. This
// proves the detector catches a forbidden translation dir and passes a clean one — the file-
// side twin of the picker guard (translation-licensing.test.ts).
import { afterAll, describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { findForbiddenBibleTranslations } from '../helpers/corpus-scan';

const tmp = mkdtempSync(path.join(tmpdir(), 'bibgate-'));
afterAll(() => rmSync(tmp, { recursive: true, force: true }));

describe('findForbiddenBibleTranslations (deploy gate)', () => {
  it('detects a copyrighted translation dir (the C1 bug)', () => {
    const d = path.join(tmp, 'bad');
    for (const t of ['web', 'kjv', 'leb', 'mkjv']) mkdirSync(path.join(d, t), { recursive: true });
    expect(findForbiddenBibleTranslations(d).sort()).toEqual(['leb', 'mkjv']);
  });
  it('passes a clean PD-only tree', () => {
    const d = path.join(tmp, 'good');
    for (const t of ['web', 'kjv', 'asv', 'ylt']) mkdirSync(path.join(d, t), { recursive: true });
    expect(findForbiddenBibleTranslations(d)).toEqual([]);
  });
});

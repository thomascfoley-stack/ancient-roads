// T1§4 — the license gate is BLIND to UGC by construction. Two content classes, opposite
// handling: corpus (user_id IS NULL, static files under web/public/) is block-by-default and
// gated here; user-generated content (user_id IS NOT NULL: uploads in Vercel Blob, rows in
// user tables) is out of scope — the gate must never read a user table or blob. This proves it.
import { describe, expect, it } from 'vitest';
import { mkdtempSync, mkdirSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { blockedBibleTranslations } from '../helpers/corpus-scan';

const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const gateSource = () =>
  readFileSync(path.join(REPO, 'scripts/predeploy-gate.ts'), 'utf8') +
  readFileSync(path.join(REPO, 'web/test/helpers/corpus-scan.ts'), 'utf8') +
  readFileSync(path.join(REPO, 'web/src/lib/licensing.ts'), 'utf8');

describe('T1§4 — the license gate is blind to UGC', () => {
  it('no gate module imports the DB handle or a blob store, or calls runAsUser/getDb', () => {
    const src = gateSource();
    // CODE couplings to user data (not comments): a db/blob import, or a runtime user-data call.
    const forbidden = [
      /from ['"][^'"]*\/lib\/db['"]/, // getDb / runAsUser handle
      /@vercel\/blob/, // user upload blob store
      /\brunAsUser\s*\(/,
      /\bgetDb\s*\(/,
      /from ['"][^'"]*\/lib\/chat['"]/,
      /from ['"][^'"]*\/lib\/annotations['"]/,
    ];
    const hits = forbidden.filter((re) => re.test(src)).map((re) => re.source);
    expect(hits, `gate reads user data (defect): ${hits.join(', ')}`).toEqual([]);
  });

  it('everything in a scanned location is treated as CORPUS — a UGC-looking dir is not read as user data, it is license-checked', () => {
    // Seed a "user upload" directory into the bible scan location. The gate does not have a
    // UGC code path: it classifies it as a corpus work with no license record → BLOCKED. It
    // never reads it as user content. (The scan location is structurally corpus-only.)
    const d = mkdtempSync(path.join(tmpdir(), 'ugc-'));
    mkdirSync(path.join(d, 'web')); // a real allow-listed corpus work
    mkdirSync(path.join(d, 'user-upload-abc123')); // a UGC-looking intruder
    const blocked = blockedBibleTranslations(d).map((b) => b.id);
    rmSync(d, { recursive: true, force: true });
    expect(blocked, 'a UGC-looking dir is license-checked as corpus (blocked), never read as user data').toEqual([
      'user-upload-abc123',
    ]);
  });

  it('isolation: the served embeddings query filters user_id IS NULL (no user row can be served as corpus)', () => {
    const routing = readFileSync(path.join(REPO, 'web/src/lib/teacher/routing.ts'), 'utf8');
    // base pool + inject + backfill all scope to corpus rows. Prod fact (2026-07-14): 0 rows
    // in embeddings have user_id IS NOT NULL, so this is belt over an already-empty set.
    const count = (routing.match(/user_id IS NULL/g) ?? []).length;
    expect(count, 'every served embeddings SQL builder must filter user_id IS NULL').toBeGreaterThanOrEqual(3);
  });
});

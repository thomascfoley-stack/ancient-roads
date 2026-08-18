// The studies API routes export NO GET — pinned statically, with the reason.
//
// WHY (2026-08-17 deep-audit, domain lens finding A / HIGH): GET /api/studies/[id] and
// GET /api/studies/[id]/blocks returned STORED clipping quotes verbatim with no servability
// re-check — the §4.4 bypass servability.ts exists to close: a work withdrawn for a licensing
// reason keeps serving its text to whoever saved it, forever. The feed route's own header named
// this gap (F-W3-2) and shipped anyway.
//
// THE REMEDY IS DELETION, NOT PLUMBING (bylaw 3): both GETs had ZERO consumers — every fetch of
// /api/studies/[id] in web/src is PATCH or DELETE (study-delete-button.tsx, study-editor.tsx),
// every fetch of /api/studies/[id]/blocks is POST, PATCH, or DELETE (save-to-study.tsx,
// study-library-panel.tsx, study-editor.tsx). The shipped read paths are the study page
// (getStudyWithBlocks + resolveServability, both Flow D legs) and GET /studies/[id]/feed
// (listBlocks + resolveServability). This is the exact precedent of /api/research/[id]'s GET,
// deleted under bylaw 3 because it "had zero consumers and returned stored answers with no
// servability data — a §4.4 bypass for any future consumer" (research-history-static.test.ts
// I-1). Re-adding a GET here reintroduces the bypass, so the absence is pinned rather than
// left to a reviewer noticing.
//
// The tripwires follow research-history-static.test.ts: comments stripped first (so a comment
// MENTIONING a GET cannot trip it, and a commented-out export cannot satisfy it), and the
// export-line match covers `export async function GET`, `export const GET = …`, and
// `export { x as GET }` alike. Each leg asserts PRESENCE of the surviving verbs before
// asserting ABSENCE of GET — a file move or rename goes loudly red instead of fake-green.
//
// Red-proof: watched RED against the pre-deletion tree (both GETs still exported), then the
// deletion landed and both legs went green. See the 2026-08-17 fix session report.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..'); // web/ (this file lives in web/test/invariants)
const stripComments = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
const routeSrc = (rel: string) => stripComments(readFileSync(path.join(ROOT, rel), 'utf8'));

describe('studies API — stored-quote GETs stay deleted (servability §4.4)', () => {
  it('/api/studies/[id] exports PATCH and DELETE, and NO GET', () => {
    const src = routeSrc('src/app/api/studies/[id]/route.ts');
    // Anti-vacuity: prove we are reading the live route, not an empty or moved file.
    expect(src, 'the [id] route must still export PATCH').toMatch(/export async function PATCH/);
    expect(src, 'the [id] route must still export DELETE').toMatch(/export async function DELETE/);
    expect(
      src,
      'the [id] route must NOT export GET — it returned stored quotes with no servability ' +
        're-check and was deleted for it (the /api/research/[id] precedent)',
    ).not.toMatch(/export[\s\S]{0,200}?\bGET\b/);
  });

  it('/api/studies/[id]/blocks exports POST, PATCH and DELETE, and NO GET', () => {
    const src = routeSrc('src/app/api/studies/[id]/blocks/route.ts');
    expect(src, 'the blocks route must still export POST').toMatch(/export async function POST/);
    expect(src, 'the blocks route must still export PATCH').toMatch(/export async function PATCH/);
    expect(src, 'the blocks route must still export DELETE').toMatch(/export async function DELETE/);
    expect(
      src,
      'the blocks route must NOT export GET — raw blocks carry `quote` verbatim; the ONLY ' +
        'paginated read is /studies/[id]/feed, which runs resolveServability per page',
    ).not.toMatch(/export[\s\S]{0,200}?\bGET\b/);
  });

  it('the servability-checked feed route still exists and still re-checks (the read path the deletion points at)', () => {
    // The deletion is only safe while the checked read path survives. If the feed route ever
    // loses resolveServability, the study surface has NO checked paginated read left, and this
    // pin — not a reviewer — says so.
    const src = routeSrc('src/app/studies/[id]/feed/route.ts');
    expect(src, 'the feed route must export GET').toMatch(/export async function GET/);
    expect(src, 'the feed route must call resolveServability').toMatch(/resolveServability\s*\(/);
    expect(src, 'the feed route must compute renderState via blockRenderState').toMatch(/blockRenderState\s*\(/);
  });
});

// Research history — the invariants that hold by construction, pinned statically so an edit
// that breaks one goes red without a database (ASK_HISTORY_DESIGN §4.1, §4.5, §6).
//
// These are TRIPWIRES over source text, hardened against the evasions inspector 2 PROVED
// against v1 (docs/evidence/research-history/build-findings-2026-08-16.md I2-H1/H2/M1):
//   - `export const POST = …` and `export { x as POST }` both slipped the old function-only
//     regex → the guard now flags ANY export line naming a write verb, comments stripped.
//   - a comment containing `appendQuestion(` above `teach()` defeated the old indexOf →
//     comments are stripped before the order check, and the CALL form is matched.
//   - `content=${q}` (no space) and `lower(content) =` slipped the old content regex →
//     widened, and the scan now covers every file under src/app + src/lib, not one file.
// Each hardened form was re-proved red against the original seeded evasion before landing.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { execSync } from 'node:child_process';
import path from 'node:path';

const ROOT = path.join(__dirname, '..', '..', '..'); // repo root (this file lives in web/test/invariants)
const read = (p: string) => readFileSync(path.join(ROOT, p), 'utf8');
const stripComments = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

describe('research history — static invariants', () => {
  it('I-1: /api/research is READ-ONLY — no export of a write verb in ANY form', () => {
    // A client that could write history rows could store text that later re-renders as
    // Ancient Paths output, attributed, in the product's typography. The assistant row is
    // written exclusively inside /api/ask/stream from the object teach() returned.
    // NOTE the [id] route was DELETED (I1-M4, bylaw 3): it had zero consumers and returned
    // stored answers with no servability data — a §4.4 bypass for any future consumer.
    // AMENDED 2026-08-17, narrowly, and the narrowness is the point. I-1's stated reason is that
    // "a client that could write history rows could store text that later re-renders as Ancient
    // Paths output" — a claim about ORIGINATING CONTENT. POST/PUT/PATCH can do that and stay
    // forbidden on every route under /api/research. A DELETE cannot: it removes rows and never
    // authors one, so no text reaches the assistant-attributed render path through it. Threads
    // were otherwise unremovable by any means — the 2026-08-17 authenticated QA pass filed nine
    // stuck on the owner's real account. See docs/pm/orders/2026-08-17-research-thread-delete.md.
    //
    // The amendment is per-route rather than global, so the list route cannot quietly grow a
    // write verb on the strength of an argument made about a different file.
    const routes = execSync(`find "${path.join(ROOT, 'web/src/app/api/research')}" -name "route.ts"`, { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean)
      .sort();
    expect(routes.map((r: string) => path.relative(ROOT, r)), 'the research routes are exactly these two').toEqual([
      'web/src/app/api/research/[id]/route.ts',
      'web/src/app/api/research/route.ts',
    ]);

    const listSrc = stripComments(readFileSync(path.join(ROOT, 'web/src/app/api/research/route.ts'), 'utf8'));
    expect(listSrc, 'the list route must export GET').toMatch(/export async function GET/);
    expect(listSrc, 'the list route must not export ANY write verb').not.toMatch(
      /export[\s\S]{0,200}?\b(POST|PUT|PATCH|DELETE)\b/,
    );

    const idSrc = stripComments(readFileSync(path.join(ROOT, 'web/src/app/api/research/[id]/route.ts'), 'utf8'));
    expect(idSrc, 'the [id] route must export DELETE').toMatch(/export async function DELETE/);
    // Content-originating verbs stay forbidden HERE TOO — only DELETE was argued for.
    expect(idSrc, 'the [id] route must not export a content-originating verb').not.toMatch(
      /export[\s\S]{0,200}?\b(POST|PUT|PATCH)\b/,
    );
    // AND NO GET. An /api/research/[id] route existed once and was deleted (I1-M4) because it
    // returned STORED ANSWERS with no servability data — a §4.4 bypass, where a quote whose
    // source has since been unserved would render anyway. Re-adding a GET here reintroduces it,
    // so the absence is pinned rather than left to a reviewer noticing.
    expect(idSrc, 'the [id] route must NOT export GET — that is the §4.4 bypass it was deleted for').not.toMatch(
      /export[\s\S]{0,200}?\bGET\b/,
    );
  });

  it('I-1b: the assistant write exists only in the stream route (server-side, post-verifier)', () => {
    const streamSrc = read('web/src/app/api/ask/stream/route.ts');
    expect(streamSrc).toMatch(/appendAnswer\(/);
    // Derived from the app tree, not hand-listed — and keyed on the MODULE SPECIFIER, not the
    // function name, so an aliased import cannot slip it (I2-L3).
    //
    // COMMENT-STRIPPED BEFORE DECIDING, as of 2026-08-18 — the third home of one defect. The raw
    // grep classified two routes as importers because their WHY comments accurately NAME
    // lib/research while documenting the persona bypass (audit #5) — prose, not imports. The
    // pressure a content-level guard creates runs backwards: it teaches people to weaken accurate
    // comments to appease a test. routeSpendsMoney learned this (a comment saying teach() made a
    // DELETE route a "spender"), this file's own order-check learned it in v1 (a comment saying
    // appendQuestion( defeated it), and now its import fence. The grep stays as the cheap
    // candidate filter; the DECISION is made on comment-stripped source matching an actual
    // import/require of the specifier.
    const hits = execSync(
      `grep -rl "lib/research" "${path.join(ROOT, 'web/src/app')}" || true`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean)
      .filter((f: string) => {
        const code = stripComments(readFileSync(f, 'utf8'));
        return /(?:from\s*['"][^'"]*lib\/research(?:\.m?js)?['"]|require\(\s*['"][^'"]*lib\/research)/.test(code);
      })
      .map((p: string) => path.relative(ROOT, p))
      .sort();
    // WHAT the [id] route imports, not merely THAT it may. The allowlist below admits the file;
    // this pins the symbol. Without it a DELETE handler on that route could import `appendAnswer`
    // and — HTTP DELETE carries a body — turn `await req.json()` into an assistant-attributed row,
    // with I-1 green (the export is named DELETE) and I-1b green (the file is on the list). Found
    // by the 2026-08-17 pre-deploy audit; the adjacent comment already CLAIMED "imports
    // deleteThread only" and nothing asserted it.
    const idRouteSrc = stripComments(readFileSync(path.join(ROOT, 'web/src/app/api/research/[id]/route.ts'), 'utf8'));
    const researchImport = idRouteSrc.match(/import\s*\{([^}]*)\}\s*from\s*['"]@\/lib\/research['"]/);
    expect(researchImport, 'the [id] route must import from lib/research with a named import').toBeTruthy();
    expect(
      researchImport![1].split(',').map((x) => x.trim()).filter(Boolean),
      'the [id] route may import deleteThread and nothing else from lib/research',
    ).toEqual(['deleteThread']);

    expect(hits).toEqual([
      'web/src/app/api/ask/stream/route.ts',
      // Imports `deleteThread` only. Removing rows cannot originate an assistant-attributed
      // answer, which is what this leg exists to fence.
      'web/src/app/api/research/[id]/route.ts',
      'web/src/app/api/research/route.ts',
      'web/src/app/ask/[id]/page.tsx',
    ]);
  });

  it('I-2: the question row is written BEFORE teach() runs — comments cannot fake it', () => {
    // A question that crashes the pipeline is exactly the one the reader wants back. This is
    // a tripwire; the behavioral half (teach throws → question row exists) lives in the
    // tenancy suite's design and the route's fail-open structure.
    const src = stripComments(read('web/src/app/api/ask/stream/route.ts'));
    const persistIdx = Math.min(
      ...['await createThreadWithQuestion(', 'await appendQuestion('].map((c) => {
        const i = src.indexOf(c);
        return i === -1 ? Number.MAX_SAFE_INTEGER : i;
      }),
    );
    const teachIdx = src.indexOf('await teach(');
    expect(persistIdx, 'question persistence call must exist').toBeLessThan(Number.MAX_SAFE_INTEGER);
    expect(teachIdx, 'teach must be called').toBeGreaterThan(-1);
    expect(persistIdx, 'question persistence must precede the teach() call').toBeLessThan(teachIdx);
  });

  it('§4.5 transcript-not-cache: NO lookup by message content anywhere in the app', () => {
    // The binding rule that stops a transcript quietly becoming a cache: threads are keyed by
    // id and owner, never by content. Widened per I2-M1 (no-space `=`, lower(), regex/strpos/
    // similarity/position, all pgvector operators) and scanned repo-wide over web/src, not
    // one file.
    const files = execSync(
      `grep -rlE "FROM messages|INTO messages" "${path.join(ROOT, 'web/src')}" || true`,
      { encoding: 'utf8' },
    )
      .split('\n')
      .filter(Boolean);
    expect(files.length, 'the scan found the store (anti-vacuity)').toBeGreaterThan(0);
    for (const f of files) {
      const src = stripComments(readFileSync(f, 'utf8'));
      expect(src, `${f}: content used as a lookup key`).not.toMatch(
        /(lower\(\s*)?content\s*\)?\s*(I?LIKE|=(?!=)|~|<->|<=>|<#>)/i,
      );
      expect(src, `${f}: text-search on content`).not.toMatch(
        /to_tsquery|websearch_to_tsquery|plainto_tsquery|strpos\s*\(\s*content|similarity\s*\(\s*content|position\s*\([^)]*in\s+content/i,
      );
    }
  });

  it('the ask pipeline never reads history: nothing under lib/teacher references research or chat', () => {
    // Owner ruling 2026-08-16: every ask runs fresh; the pipeline takes the question and the
    // corpus and nothing else. Keyed on module specifiers in ANY import form (static, dynamic,
    // deep-relative) per I2-L3.
    const hits = execSync(
      `grep -rlE "lib/research|lib/chat" "${path.join(ROOT, 'web/src/lib/teacher')}" || true`,
      { encoding: 'utf8' },
    ).trim();
    expect(hits).toBe('');
  });
});

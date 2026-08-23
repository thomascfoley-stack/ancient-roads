// CSRF Content-Type floor — every cookie-authenticated mutating route that parses a JSON body
// rejects simple Content-Types (WORKLOG 2026-08-21 deferred security finding, swarm W-SEC-CSRF).
//
// THE ROUTE LIST IS DERIVED, NOT HAND-TYPED (watchlist class): this suite GLOBS
// src/app/api/&#42;&#42;/route.ts, keeps files that import a cookie-session guard
// (@/lib/session or @/lib/user-corpus/route-guard), extracts each exported mutating handler by
// brace-matching, and takes the handlers that call req.json(). Every one of those handlers must
// call requireJsonContentType BEFORE the parse. A new route with that shape fails here until it
// calls the guard or is consciously parked in HELD with a reason — the floor is a ratchet.
//
// HELD (the order's ambiguity stop — heterogeneous routes get an owner ruling, not an invented
// per-route policy; see /tmp status file docs/pm/swarm-2026-08-22/items/W-SEC-CSRF.md):
// every HELD key must still derive as a candidate, so the registry cannot silently rot.
//
// Red-proofs (docs/evidence/swarm-2026-08-22/w-sec-csrf/):
//  (a) guard call removed from one route (prayers) → only that route's leg fails;
//  (b) guard seeded to `return null` → the behavioral legs fail;
//  (c) a fixture route with an unguarded JSON POST dropped into the api tree → the derived
//      list grows and the new leg fails (proves the glob, not a hand-typed list).
import { describe, expect, it, vi } from 'vitest';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { requireJsonContentType } from '@/lib/csrf-floor';

const ROOT = path.join(__dirname, '..', '..'); // web/ (this file lives in web/test/invariants)
const API_ROOT = path.join(ROOT, 'src', 'app', 'api');
const stripComments = (s: string) => s.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');

function* routeFiles(dir: string): Generator<string> {
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) yield* routeFiles(full);
    else if (entry === 'route.ts') yield path.relative(ROOT, full);
  }
}

const COOKIE_AUTH = /@\/lib\/session|@\/lib\/user-corpus\/route-guard/;
const HANDLER_RE = /export\s+(?:async\s+)?function\s+(POST|PUT|PATCH|DELETE)\s*\(/g;
const PARSES_JSON = /\breq\.json\s*\(/;
const GUARD_CALL = /\brequireJsonContentType\s*\(/;

interface Candidate {
  file: string;
  method: string;
  body: string;
}

/** Exported mutating handlers, bodies extracted by brace-matching from the export's first `{`. */
function mutatingHandlers(src: string): { method: string; body: string }[] {
  const out: { method: string; body: string }[] = [];
  HANDLER_RE.lastIndex = 0;
  for (let m = HANDLER_RE.exec(src); m; m = HANDLER_RE.exec(src)) {
    // Skip the parameter list first: a ctx type annotation (`ctx: { params: … }`) contains
    // braces, so the body opens at the first `{` AFTER the matching `)` of the call parens.
    let parens = 0;
    let i = src.indexOf('(', m.index);
    for (; i < src.length; i++) {
      if (src[i] === '(') parens++;
      else if (src[i] === ')') {
        parens--;
        if (parens === 0) break;
      }
    }
    const open = src.indexOf('{', i);
    let depth = 0;
    for (i = open; i < src.length; i++) {
      if (src[i] === '{') depth++;
      else if (src[i] === '}') {
        depth--;
        if (depth === 0) break;
      }
    }
    out.push({ method: m[1]!, body: src.slice(open, i + 1) });
  }
  return out;
}

/** Cookie-authenticated mutating handlers that parse a JSON body — the floor's whole scope. */
function deriveCandidates(): Candidate[] {
  const out: Candidate[] = [];
  for (const file of routeFiles(API_ROOT)) {
    const src = readFileSync(path.join(ROOT, file), 'utf8');
    if (!COOKIE_AUTH.test(src)) continue;
    for (const h of mutatingHandlers(stripComments(src))) {
      if (PARSES_JSON.test(h.body)) out.push({ file, method: h.method, body: h.body });
    }
  }
  return out;
}

// Heterogeneous derived candidates, parked per the order's ambiguity stop. A route leaves this
// list by an owner ruling implemented in the route, not by deleting the key.
const HELD: Record<string, string> = {
  'src/app/api/user-corpus/documents/[id]/readings/route.ts':
    'a no-body POST is a designed valid request (re-run with the document’s stored categories; ' +
    'the route catches the JSON parse failure), so a strict JSON floor would change product ' +
    'behavior — owner ruling required for bodyless-mutation CSRF policy',
};

const candidates = deriveCandidates();
const floored = candidates.filter((c) => !(c.file in HELD));

describe('CSRF Content-Type floor — derived route list', () => {
  it('anti-vacuity: the glob finds the expected population (and the known canary route)', () => {
    // 16 floored files + 1 HELD at enumeration time (2026-08-22); the canary pins that we are
    // reading the live tree, and the floor count pins that derivation did not quietly go empty.
    expect(candidates.length).toBeGreaterThanOrEqual(16);
    expect(candidates.some((c) => c.file === 'src/app/api/history/search/route.ts' && c.method === 'POST')).toBe(true);
  });

  it.each(floored.map((c) => [`${c.method} ${c.file}`, c] as const))(
    '%s calls requireJsonContentType BEFORE req.json()',
    (_label, c) => {
      const guardAt = c.body.search(GUARD_CALL);
      expect(guardAt, `${c.method} ${c.file} parses a JSON body without the CSRF floor`).toBeGreaterThanOrEqual(0);
      expect(
        guardAt < c.body.search(PARSES_JSON),
        `${c.method} ${c.file} must floor the Content-Type before parsing the body`,
      ).toBe(true);
    },
  );

  it.each(Object.entries(HELD).map(([file, reason]) => [file, reason] as const))(
    'HELD route %s still derives as a candidate (registry cannot rot)',
    (file, _reason) => {
      expect(candidates.some((c) => c.file === file)).toBe(true);
    },
  );
});

describe('requireJsonContentType — the guard itself', () => {
  const withType = (ct: string | null) =>
    new Request('http://x/api/anything', {
      method: 'POST',
      ...(ct === null ? {} : { headers: { 'content-type': ct } }),
    });

  it.each(['text/plain', 'application/x-www-form-urlencoded', 'multipart/form-data; boundary=x'])(
    'rejects the CORS-simple Content-Type %s with the standard envelope',
    async (ct) => {
      const res = requireJsonContentType(withType(ct));
      expect(res).not.toBeNull();
      expect(res!.status).toBe(400);
      const body = (await res!.json()) as { error: { code: string } };
      expect(body.error.code).toBe('INVALID_REQUEST');
    },
  );
  it('rejects a missing Content-Type the same way', () => {
    expect(requireJsonContentType(withType(null))?.status).toBe(400);
  });
  it.each(['application/json', 'application/json; charset=utf-8', 'Application/JSON'])(
    'admits %s',
    (ct) => {
      expect(requireJsonContentType(withType(ct))).toBeNull();
    },
  );
});

// One representative route exercised end-to-end (the mock idiom of history-search-route.test.ts):
// the floor, not just the helper, wired into a shipped handler.
vi.mock('@/lib/session', () => ({ requireUser: vi.fn() }));
vi.mock('@/lib/rate-limit', () => ({ checkHistorySearchRateLimit: vi.fn() }));
vi.mock('@/lib/history-search-db', () => ({ searchHistory: vi.fn() }));

import { POST as historySearchPost } from '@/app/api/history/search/route';
import { requireUser } from '@/lib/session';
import { checkHistorySearchRateLimit } from '@/lib/rate-limit';
import { searchHistory } from '@/lib/history-search-db';

describe('POST /api/history/search — the floor on the wire', () => {
  it('a simple-Content-Type mutation is 400 and never reaches retrieval', async () => {
    vi.mocked(requireUser).mockResolvedValue({ id: 'u1' } as never);
    const res = await historySearchPost(
      new Request('http://x/api/history/search', {
        method: 'POST',
        headers: { 'content-type': 'text/plain' },
        body: JSON.stringify({ query: 'ephesus' }),
      }),
    );
    expect(res.status).toBe(400);
    expect(((await res.json()) as { error: { code: string } }).error.code).toBe('INVALID_REQUEST');
    expect(checkHistorySearchRateLimit).not.toHaveBeenCalled();
    expect(searchHistory).not.toHaveBeenCalled();
  });
});

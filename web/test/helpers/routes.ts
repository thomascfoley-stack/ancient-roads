import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const API_ROOT = path.join(__dirname, '../../src/app/api');
const SRC_ROOT = path.join(__dirname, '../../src');

export function listApiRouteFiles(): string[] {
  const out: string[] = [];
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      if (statSync(full).isDirectory()) walk(full);
      else if (name === 'route.ts') out.push(full);
    }
  };
  walk(API_ROOT);
  return out.sort();
}

export function readRouteSource(file: string): string {
  return readFileSync(file, 'utf-8');
}

/** Source with comments removed, so a route is judged on what it DOES, not what it mentions. */
function stripComments(src: string): string {
  return src.replace(/\/\/[^\n]*|\/\*[\s\S]*?\*\//g, '');
}

// Does this route actually spend money (an LLM call through teach(), or a paid embedding)?
//
// COMMENTS ARE STRIPPED FIRST, and that is a fix, not a loosening. The match is textual, so
// before this a route that merely NAMED `teach()` in a comment was classified as a spender and
// then failed the wallet invariant for not calling a rate limiter it has no reason to call —
// which is what `/api/research/[id]` (a DELETE that makes no model call) did on 2026-08-17, its
// comment explaining where the assistant row IS written.
//
// The pressure that creates is the wrong way round: it teaches people to reword an accurate
// comment to appease a test. `research-history-static.test.ts` already learned this exact lesson
// from the other direction — a comment containing `appendQuestion(` defeated its order check —
// and strips comments for the same reason. Real calls survive stripping; only prose does not.
// Every module whose use costs money at a provider. Keyed on the MODULE SPECIFIER, not on a
// function name, so an aliased import cannot slip past — the same reasoning
// research-history-static.test.ts uses for its lib/research fence.
//
// WIDENED 2026-08-17 after the pre-deploy audit. The predicate matched `teach()` alone while the
// function it backs is named `routeSpendsMoney`, so `/api/user-corpus/search` — which calls
// `embedChunks([q])` on the request path, a paid DeepInfra embedding — was not in the spender set
// and `wallet.test.ts` was GREEN over an unmetered, uncapped paid call. A guard whose predicate is
// narrower than the property it names is this repo's most-repeated defect, and it had landed
// inside the guard written to catch unmetered spend.
//
// MADE TRANSITIVE 2026-08-21 (uploader deep dive, H5) — the same defect one hop out. The reach
// was still "does the ROUTE FILE import a paid module", so /api/user-corpus/upload — which
// reaches embedChunks through `@/lib/user-corpus/queue`'s drain() — classified as non-spending
// and the wallet invariant never examined the product's largest spender. The predicate now
// resolves local imports recursively (bounded depth, cycle-safe) and asks whether the CLOSURE
// contains a paid module. Type-only imports are excluded: `import type` is erased at compile
// time and cannot execute a paid call, and counting it would drag in every route that types a
// response with TeachMeta.
const PAID_MODULES = [
  '@/lib/teacher/teach',
  '@/lib/user-corpus/embed',
] as const;

/** Value-import specifiers in `code`: static, re-export, side-effect, and dynamic `import()`. */
function importSpecs(code: string): string[] {
  const specs: string[] = [];
  const re = /(?:import|export)\s+(?!type\b)[^'"]*?from\s+['"]([^'"]+)['"]|import\s*\(\s*['"]([^'"]+)['"]\s*\)|import\s+['"]([^'"]+)['"]/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(code)) !== null) {
    const spec = m[1] ?? m[2] ?? m[3];
    if (spec) specs.push(spec);
  }
  return specs;
}

/** Resolve a LOCAL specifier to a file on disk; null for bare (package) specifiers. */
function resolveSpec(spec: string, fromFile: string): string | null {
  let base: string;
  if (spec.startsWith('@/')) base = path.join(SRC_ROOT, spec.slice(2));
  else if (spec.startsWith('@bible/')) base = path.join(SRC_ROOT, 'bible', spec.slice('@bible/'.length));
  else if (spec.startsWith('./') || spec.startsWith('../')) base = path.resolve(path.dirname(fromFile), spec);
  else return null;
  for (const candidate of [`${base}.ts`, `${base}.tsx`, `${base}.mts`, path.join(base, 'index.ts')]) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

// The paid modules as RESOLVED FILES, not specifiers, so a sibling importing './embed' is the
// same fact as a route importing '@/lib/user-corpus/embed'.
const PAID_FILES: ReadonlySet<string> = new Set(
  PAID_MODULES.map((m) => {
    const resolved = resolveSpec(m, path.join(SRC_ROOT, 'noop.ts'));
    // A paid module that stopped resolving must be LOUD: silently dropping it would turn every
    // route that spends through it green — the unearned-green shape, inside the wallet guard.
    if (!resolved) throw new Error(`paid module does not resolve to a file: ${m}`);
    return resolved;
  }),
);

// 8 hops covers every real chain (upload → queue → embed is 2) with room; the cap exists so a
// pathological import cycle plus the visited-set bookkeeping can never make the suite hang.
const MAX_IMPORT_DEPTH = 8;

/**
 * True when `file` (a route file path) can reach a paid module through its value imports.
 *
 * Breadth-first over resolved local imports, cycle-safe via the visited set. Module-level reach
 * OVER-APPROXIMATES spend — importing a module that CONTAINS a paid call is not the same as
 * calling it (queueStats lives beside drain in queue.ts) — which is the safe direction for a
 * wallet gate: false positives surface for review; a false negative is an unmetered bill.
 * wallet.test.ts carries the reviewed reach-without-spend exemptions, each self-invalidating.
 */
export function routeSpendsMoney(file: string): boolean {
  // Belt: a direct call in the route file itself, however the module got there.
  const routeCode = stripComments(readFileSync(file, 'utf-8'));
  if (/\bteach\s*\(/.test(routeCode) || /\bembedChunks\s*\(/.test(routeCode)) return true;

  const visited = new Set<string>([file]);
  let frontier = [file];
  for (let depth = 0; depth < MAX_IMPORT_DEPTH && frontier.length > 0; depth++) {
    const next: string[] = [];
    for (const f of frontier) {
      const code = stripComments(readFileSync(f, 'utf-8'));
      for (const spec of importSpecs(code)) {
        const resolved = resolveSpec(spec, f);
        if (!resolved || visited.has(resolved)) continue;
        if (PAID_FILES.has(resolved)) return true;
        visited.add(resolved);
        next.push(resolved);
      }
    }
    frontier = next;
  }
  return false;
}

export function relRoute(file: string): string {
  return path.relative(API_ROOT, file).replace(/\\/g, '/');
}

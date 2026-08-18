import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

const API_ROOT = path.join(__dirname, '../../src/app/api');

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

// Does this route actually spend money (an LLM call through teach())?
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
const PAID_MODULES = [
  '@/lib/teacher/teach',
  '@/lib/user-corpus/embed',
] as const;

export function routeSpendsMoney(src: string): boolean {
  const code = stripComments(src);
  for (const m of PAID_MODULES) {
    if (code.includes(`from '${m}'`) || code.includes(`from "${m}"`)) return true;
  }
  return /\bteach\s*\(/.test(code) || /\bembedChunks\s*\(/.test(code);
}

export function relRoute(file: string): string {
  return path.relative(API_ROOT, file).replace(/\\/g, '/');
}

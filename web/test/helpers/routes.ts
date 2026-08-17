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
export function routeSpendsMoney(src: string): boolean {
  const code = stripComments(src);
  return (
    code.includes("from '@/lib/teacher/teach'") ||
    code.includes('from "@/lib/teacher/teach"') ||
    /\bteach\s*\(/.test(code)
  );
}

export function relRoute(file: string): string {
  return path.relative(API_ROOT, file).replace(/\\/g, '/');
}

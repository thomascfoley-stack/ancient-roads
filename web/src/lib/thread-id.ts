// "Is this a research-thread id" — ONE definition, importable from the client.
//
// lib/research.ts used to own this regex, but a client component (thread-restore.tsx) needs it
// and must not pull the research store in to get it — the static allowlist in
// test/invariants/research-history-static.test.ts fences lib/research's importers. So the
// definition lives here, with no imports of its own, and lib/research re-exports it so its
// existing importers are unchanged. This file must never import lib/research.

export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isThreadId(s: unknown): s is string {
  return typeof s === 'string' && UUID_RE.test(s);
}

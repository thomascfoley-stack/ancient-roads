// `server-only` throws on import outside a React Server Component, which makes every
// server module (e.g. lib/teacher/deepinfra.ts — the SHIPPED embedder) unimportable from
// vitest. Aliasing it to this no-op lets invariants exercise the real module instead of a
// re-implementation of it, which is the whole point of testing the shipped code path.
//
// This does NOT weaken the boundary: the client/server split is enforced by `next build`,
// which still fails if a Client Component imports a server module. Vitest runs in node,
// where that distinction does not exist to begin with.
export {};

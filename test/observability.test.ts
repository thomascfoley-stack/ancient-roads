// Guards the structured observability logger (web/src/lib/observability.ts).
// It must emit exactly one JSON line of { evt, ts, ...givenFields } and add no
// ambient fields of its own (the no-secrets contract lives in the callers, but
// the logger must not smuggle anything extra in), and never throw.

import { describe, expect, it, vi } from 'vitest';
import { logEvent } from '../web/src/lib/observability';

type Fields = Parameters<typeof logEvent>[1];

describe('logEvent', () => {
  it('emits one JSON line with evt, ts, and ONLY the given fields', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    logEvent('rate_limit_hit', { userId: 'u1', cap: 'min', count: 11 });
    expect(spy).toHaveBeenCalledOnce();
    const line = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(line.evt).toBe('rate_limit_hit');
    expect(typeof line.ts).toBe('string');
    expect(Object.keys(line).sort()).toEqual(['cap', 'count', 'evt', 'ts', 'userId']);
    spy.mockRestore();
  });

  it('never throws on a non-serializable field — drops fields, keeps the event', () => {
    const spy = vi.spyOn(console, 'log').mockImplementation(() => {});
    const bad = { n: BigInt(1) } as unknown as Fields; // BigInt is not JSON-serializable
    expect(() => logEvent('error', bad)).not.toThrow();
    const line = JSON.parse(spy.mock.calls[0]![0] as string) as Record<string, unknown>;
    expect(line.evt).toBe('error');
    expect(Object.keys(line).sort()).toEqual(['evt', 'ts']); // fields dropped, event preserved
    spy.mockRestore();
  });
});

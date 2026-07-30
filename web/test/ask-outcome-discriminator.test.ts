import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logEvent } from '@/lib/observability';

/** Shape emitted by ask routes — must distinguish provider errors from verifier rejection. */
function askOutcomePayload(meta: {
  kind: string;
  attempts: number;
  firstCheck?: string;
  voices: number;
  traditions: number;
  ms: number;
}) {
  logEvent('ask_outcome', {
    kind: meta.kind,
    ms: meta.ms,
    attempts: meta.attempts,
    ...(meta.firstCheck ? { firstCheck: meta.firstCheck } : {}),
    voices: meta.voices,
    traditions: meta.traditions,
  });
}

describe('ask_outcome discriminator fields', () => {
  let lines: string[];

  beforeEach(() => {
    lines = [];
    vi.spyOn(console, 'log').mockImplementation((...args) => {
      lines.push(String(args[0]));
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('provider 429/llm_error vs verifier rejection produce distinguishable log lines', () => {
    askOutcomePayload({
      kind: 'fallback',
      attempts: 1,
      firstCheck: 'llm_error',
      voices: 5,
      traditions: 2,
      ms: 1200,
    });
    askOutcomePayload({
      kind: 'fallback',
      attempts: 2,
      firstCheck: 'quote_verbatim',
      voices: 5,
      traditions: 2,
      ms: 9800,
    });

    expect(lines).toHaveLength(2);
    const provider = JSON.parse(lines[0]!);
    const verifier = JSON.parse(lines[1]!);
    expect(provider.firstCheck).toBe('llm_error');
    expect(verifier.firstCheck).toBe('quote_verbatim');
    expect(provider.firstCheck).not.toBe(verifier.firstCheck);
    expect(provider.attempts).toBe(1);
    expect(verifier.attempts).toBe(2);
    expect(provider.voices).toBe(5);
    expect(provider.traditions).toBe(2);
  });
});

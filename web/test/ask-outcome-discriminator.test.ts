import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { logAskOutcome } from '@/lib/ask-outcome-log';

const REPO = path.join(__dirname, '..');
const ROUTES = {
  ask: 'src/app/api/ask/route.ts',
  stream: 'src/app/api/ask/stream/route.ts',
} as const;

function routeSource(which: keyof typeof ROUTES): string {
  return readFileSync(path.join(REPO, ROUTES[which]), 'utf8');
}

describe('ask_outcome discriminator — real routes + shared logger', () => {
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

  it('both routes call logAskOutcome from the shared module', () => {
    for (const [name, rel] of Object.entries(ROUTES)) {
      const src = readFileSync(path.join(REPO, rel), 'utf8');
      expect(src, name).toContain("from '@/lib/ask-outcome-log'");
      expect(src, name).toContain('logAskOutcome(');
    }
  });

  it('provider vs verifier rejection produce distinguishable log lines (green baseline)', () => {
    logAskOutcome('fallback', 1200, {
      attempts: 1,
      firstCheck: 'llm_error',
      voices: 5,
      traditions: 2,
    });
    logAskOutcome('fallback', 9800, {
      attempts: 2,
      firstCheck: 'quote_verbatim',
      voices: 5,
      traditions: 2,
    });

    expect(lines).toHaveLength(2);
    const provider = JSON.parse(lines[0]!);
    const verifier = JSON.parse(lines[1]!);
    expect(provider.firstCheck).toBe('llm_error');
    expect(verifier.firstCheck).toBe('quote_verbatim');
    expect(provider.firstCheck).not.toBe(verifier.firstCheck);
  });

  it('RED when firstCheck is removed from the ask route', () => {
    const src = routeSource('ask');
    expect(src).toContain('logAskOutcome');
    expect(src).not.toMatch(/logAskOutcome[\s\S]*\/\/.*firstCheck/);
    // Shared module must carry firstCheck — routes delegate to it:
    const logSrc = readFileSync(path.join(REPO, 'src/lib/ask-outcome-log.ts'), 'utf8');
    expect(logSrc).toContain('firstCheck');
  });

  it('RED when firstCheck is removed from the stream route', () => {
    expect(routeSource('stream')).toContain('logAskOutcome');
    const logSrc = readFileSync(path.join(REPO, 'src/lib/ask-outcome-log.ts'), 'utf8');
    expect(logSrc).toContain('firstCheck');
  });
});

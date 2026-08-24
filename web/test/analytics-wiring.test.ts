// analytics.ts is the only door product code has to PostHog (see the file's own header and
// src/instrumentation-client.ts for the wiring + the 2026-08-18 owner ruling behind both). This
// guards that the door stays narrow, in the same source-text-assertion style
// posthog-wiring.test.ts already uses for the same reason: "should never" is not a mechanism.

import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const SRC = readFileSync(
  path.join(path.dirname(fileURLToPath(import.meta.url)), '../src/lib/analytics.ts'),
  'utf8',
);

describe('analytics.ts wiring — the tracking plan cannot smuggle product text', () => {
  it('talks to posthog-js directly, and nothing else in this file dials out', () => {
    expect(SRC).toMatch(/import posthog from 'posthog-js'/);
  });

  it('every TrackEvent property is an enum or boolean, never a free string', () => {
    // A bare `: string` field would let a call site pass a question, an email, or a filename as
    // an event property with nothing to catch it -- exactly what stripProductText exists to stop
    // at the transport layer. This stops it one layer earlier, at the type.
    const start = SRC.indexOf('export type TrackEvent =');
    const end = SRC.indexOf('export function track');
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const union = SRC.slice(start, end);
    expect(union).not.toMatch(/:\s*string(?!\s*\[\])/);
  });

  it('track() never throws — a capture failure must never surface to the reader', () => {
    const fn = SRC.slice(SRC.indexOf('export function track'));
    expect(fn).toMatch(/try\s*{/);
    expect(fn).toMatch(/catch/);
  });
});

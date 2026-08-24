// D1 (DEEP_SWEEP.md) — the P1. When a document reached `ready`, the ingest drain wrote
// readings_status='pending' (bumping updated_at). Two writers then meant OPPOSITE things by
// one word: to the queue `pending` was "awaiting the first kick", to the route it was "a job
// has claimed this document". The consequences composed into a permanent wedge:
//
//   claim side — readingsStartRefused('pending', <fresh>) === true  (refused for 10 minutes)
//   UI side    — running = status==='running' || status==='pending' === true
//                → fake 0% "Starting the search…" bar, and the buttons are gated on !running
//
// Nothing auto-kicks, so nothing ever changes the status, so the button never appears, so the
// 10-minute stale window is never reached by anything that could use it. Wedged forever.
//
// The exit test is the DEADLOCK property, not the deleted line: no state the ingest path can
// leave a document in may be simultaneously "renders as running" and "refuses a new run".
// READINGS_AFTER_INGEST names that state so the contract is a value both sides can be tested
// against, instead of an assumption living in two files.
import { describe, expect, it } from 'vitest';
import {
  READINGS_AFTER_INGEST, readingsIsRunning, readingsStartRefused, READINGS_STALE_MS,
} from '@/lib/user-corpus/readings-store';

const NOW = Date.parse('2026-08-23T12:00:00Z');
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString();

describe('D1 — a freshly-ingested document is never wedged', () => {
  it('THE PROPERTY: the state ingest leaves is never both running-looking and claim-refusing', () => {
    const stuck = readingsIsRunning(READINGS_AFTER_INGEST)
      && readingsStartRefused(READINGS_AFTER_INGEST, iso(0), NOW);
    expect(stuck).toBe(false);
  });

  it('a freshly-ingested document can be claimed immediately', () => {
    expect(readingsStartRefused(READINGS_AFTER_INGEST, iso(0), NOW)).toBe(false);
  });

  it('a freshly-ingested document does not render as running', () => {
    expect(readingsIsRunning(READINGS_AFTER_INGEST)).toBe(false);
  });

  // The guard that made this a wedge is still WANTED for a genuinely claimed run — the fix must
  // not open the re-entrancy hole H8 closed.
  it('a genuinely claimed run is still refused inside the stale window', () => {
    expect(readingsStartRefused('pending', iso(60_000), NOW)).toBe(true);
    expect(readingsIsRunning('pending')).toBe(true);
  });

  it('a claimed run past the stale window is reclaimable', () => {
    expect(readingsStartRefused('pending', iso(READINGS_STALE_MS + 1000), NOW)).toBe(false);
  });

  it('the UI derivation is shared, not retyped: running covers pending and running only', () => {
    expect(readingsIsRunning('running')).toBe(true);
    expect(readingsIsRunning('ready')).toBe(false);
    expect(readingsIsRunning('failed')).toBe(false);
    expect(readingsIsRunning(null)).toBe(false);
  });
});

// The circuit breakers of INGESTION_LOOP.md §4 — the loop stops itself.
//
// An autonomous loop without self-halts is the slop machine by name
// (THE_LOOP rule 8). Five breakers, each earning its place from a scar:
//
//   staged-backlog   PAUSE — pace to owner review, not miles ahead. Trip when
//                    the works staged THIS RUN reach the digest-batch cap; the
//                    emitted digest is the unit of owner review, so the cap is
//                    run-scoped. (A global staged count is meaningless on a dev
//                    corpus that already carries hundreds of staged works.)
//   quarantine-rate  HALT — >rate of ATTEMPTED quarantines (after minAttempts):
//                    one work's source/edition is likely wrong at scale.
//   consecutive-failure HALT — N works in a row fail the SAME code: the
//                    gate/instrument is likely broken; don't stage garbage at
//                    scale ("kill the broken instrument").
//   novel-fork       (handled at classify time, not here) — a failure code the
//                    tree doesn't cover escalates; the loop never invents a fix.
//   budget           PAUSE — run-level elapsed/attempts cap; checkpoint and
//                    resume later (the loop is idempotent, so a pause is free).
//
// Pure and synchronous so every breaker can be watched trip in a test without
// a database (THE_LOOP rule 4: a check that has not been watched go RED
// proves nothing).

export type BreakerAction = 'pause' | 'halt';

export interface BreakerTrip {
  breaker: 'staged-backlog' | 'quarantine-rate' | 'consecutive-failure' | 'budget';
  action: BreakerAction;
  reason: string;
}

export interface BreakerConfig {
  /** quarantine-rate: trip when quarantined/attempted exceeds this… */
  quarantineRate: number;
  /** …but only once at least this many works have been attempted */
  minAttempts: number;
  /** consecutive-failure: this many identical failure codes in a row HALTs */
  consecutiveLimit: number;
  /** staged-backlog: pause after this many works staged in one run */
  stagedCap: number;
  /** budget: pause after this many ms elapsed (0 = no time cap) */
  maxElapsedMs: number;
  /** budget: pause after this many works attempted (0 = no attempts cap) */
  maxAttempts: number;
}

export const DEFAULT_BREAKERS: BreakerConfig = {
  quarantineRate: 0.3,
  minAttempts: 4,
  consecutiveLimit: 3,
  stagedCap: 30,
  maxElapsedMs: 6 * 60 * 60 * 1000,
  maxAttempts: 0,
};

export interface LoopBreakerState {
  attempted: number;
  quarantined: number;
  stagedThisRun: number;
  /** failure codes of quarantined works, in order — escalations never enter */
  recentCodes: string[];
  elapsedMs: number;
  /** a work hit an exhausted provider rate limit this run (budget/rate breaker) */
  rateLimited?: boolean;
}

/**
 * Evaluate the breakers in a fixed precedence — HALT-class first, so a broken
 * instrument stops the run even on the same work that would merely have paced
 * it. Returns the first trip, or null.
 */
export function checkBreakers(s: LoopBreakerState, cfg: BreakerConfig = DEFAULT_BREAKERS): BreakerTrip | null {
  if (cfg.consecutiveLimit > 0 && s.recentCodes.length >= cfg.consecutiveLimit) {
    const tail = s.recentCodes.slice(-cfg.consecutiveLimit);
    if (tail.every((c) => c === tail[0])) {
      return {
        breaker: 'consecutive-failure',
        action: 'halt',
        reason: `${cfg.consecutiveLimit} works in a row failed '${tail[0]}' — the gate/instrument is likely broken, not the works`,
      };
    }
  }
  if (s.attempted >= cfg.minAttempts && s.quarantined / s.attempted > cfg.quarantineRate) {
    return {
      breaker: 'quarantine-rate',
      action: 'halt',
      reason: `quarantine rate ${s.quarantined}/${s.attempted} > ${Math.round(cfg.quarantineRate * 100)}% — investigate before resuming`,
    };
  }
  // The budget/rate breaker (INGESTION_LOOP.md §4): an exhausted provider 429
  // is a PAUSE, never a quarantine — the work is innocent; the run is out of
  // budget. Checkpoint and resume; the loop is idempotent, so a pause is free.
  if (s.rateLimited) {
    return {
      breaker: 'budget',
      action: 'pause',
      reason: 'DeepInfra 429 backoff exhausted — pausing; resume the run later (the work is not quarantined)',
    };
  }
  if (cfg.maxElapsedMs > 0 && s.elapsedMs >= cfg.maxElapsedMs) {
    return {
      breaker: 'budget',
      action: 'pause',
      reason: `elapsed ${Math.round(s.elapsedMs / 60000)}min reached the ${Math.round(cfg.maxElapsedMs / 60000)}min run cap — checkpoint and resume`,
    };
  }
  if (cfg.maxAttempts > 0 && s.attempted >= cfg.maxAttempts) {
    return {
      breaker: 'budget',
      action: 'pause',
      reason: `${s.attempted} attempts reached the run cap of ${cfg.maxAttempts} — checkpoint and resume`,
    };
  }
  if (cfg.stagedCap > 0 && s.stagedThisRun >= cfg.stagedCap) {
    return {
      breaker: 'staged-backlog',
      action: 'pause',
      reason: `${s.stagedThisRun} works staged this run reached the digest-batch cap of ${cfg.stagedCap} — clear the publish digest before more intake`,
    };
  }
  return null;
}

/**
 * Map a failure to a code the decision tree covers. A code the tree does NOT
 * cover ('unknown') is the novel-fork stop: the caller escalates, never
 * invents a fix (INGESTION_LOOP.md §6 — deciding is a coded map, not judgment).
 */
export function classifyFailure(message: string): string {
  const m = message ?? '';
  if (/429|rate.?limit|engine_overloaded|quota/i.test(m)) return 'embed-429';
  if (/ECONNREFUSED|ECONNRESET|ETIMEDOUT|fetch failed|getaddrinfo|socket hang up|HTTP 5\d\d|HTTP 4\d\d/i.test(m)) return 'fetch';
  if (/licen[cs]e|provenance|forbidden domain/i.test(m)) return 'license';
  if (/parse|empty|no sections|no units|no text|structure|versification|malformed/i.test(m)) return 'parse';
  return 'unknown';
}

/** Codes the decision tree covers — anything else escalates. Exported so the
 *  escalation path and the tests share one list (never re-typed). */
export const KNOWN_FAILURE_CODES = ['embed-429', 'fetch', 'license', 'parse'] as const;

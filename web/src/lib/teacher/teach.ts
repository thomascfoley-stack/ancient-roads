import 'server-only';
import type { TeacherResponse } from '@/contract/types';
import type { Violation } from '@/verifier/types';
import { verifyV1 } from '@/verifier/v1';
import { normalizeForMatch } from '@/verifier/normalize';
import { embedQuery, compose } from './deepinfra';
import { retrieveCommentary, retrieveSongVerse, retrieveSermonLane, retrieveTheologyLane, retrieveHistorianLane, type RetrievedChunk, type SongVerseChunk, type RegisterLaneChunk } from './retrieve';
import { hasPassageCoverage } from './routing';
import { resolveIntent } from '../../bible/pericopes';
import { formatVerseId } from '../../bible/verse-id';
import { buildCorpusLookup } from './corpus';
import { normalizeContract } from './normalize-contract';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import { retrieveUserVoices, formatUserLibrarySources, type UserVoice } from './user-voices';
import { attachSectionOrdinals } from './section-locate';
import {
  MAX_RETRIES,
  ASK_MAX_DURATION_MS,
  composeTimeoutMs,
} from './teach-budget';

export {
  MAX_RETRIES,
  ASK_MAX_DURATION_MS,
  ASK_MAX_DURATION_SEC,
  composeTimeoutMs,
  teachBudgetFits,
  PIPELINE_RESERVE_MS,
} from './teach-budget';

// Register-lane payloads (song_verse, sermons, theology, historians) ride alongside the
// exegetical answer — labeled, retrieve-and-quote, never composed/floored.
type LanePayloads = { song_verse?: SongVerseChunk[]; sermons?: RegisterLaneChunk[]; theology?: RegisterLaneChunk[]; historians?: RegisterLaneChunk[] };
export type TeacherResult =
  | ({ kind: 'composed'; response: TeacherResponse; retrieval: RetrievedChunk[] } & LanePayloads)
  // The fallback payload is serialized into the /api/ask response body, so its violations are
  // stripped to check+message: `span` is model-authored text (see RejectedAttempt below) and the
  // "never emit unverified model text to a user" rule applies to the fallback path most of all.
  | ({ kind: 'fallback'; retrieval: RetrievedChunk[]; violations: { check: string; message: string }[] } & LanePayloads)
  | { kind: 'empty'; reason: string };

/** Per-stage wall-clock, ms (plan 2026-08-13 B1). compose/verify are PER-ATTEMPT arrays so
 *  retries are visible, not averaged away. Two Date.now() calls per stage — nothing else rides
 *  the request path. */
export type StageTimings = {
  embed: number;
  retrieve: number;
  /** Extra wait for the register lanes AFTER commentary retrieval resolved (they overlap). */
  lanes: number;
  compose: number[];
  verify: number[];
  total: number;
};

/** One rejected compose attempt, kept for the failure-code diagnostic (verdict
 *  2026-08-15 §5/§6 step 1). The verifier already computes the full `Violation[]` for every
 *  rejection; `firstCheck` below kept only the first check's NAME and the rest was dropped one
 *  line later, so the very payload the diagnostic needs was being produced and discarded.
 *
 *  `span` is MODEL OUTPUT in both places the verifier sets it — `block.quote` at v1.ts:72 (the
 *  model's claimed quote, recorded precisely because it FAILED to match the corpus, so by
 *  construction it is not a corpus reproduction) and `hit.span` at v1.ts:253 (a screen hit over
 *  model-authored text). It is bounded here anyway, and the sink is the server-only ask_outcome
 *  log — never a response body. */
export type RejectedAttempt = {
  attempt: number;
  violations: { check: string; message: string; span?: string }[];
};

/** Observability fields for ask_outcome — no question text, no secrets. */
export type TeachMeta = {
  attempts: number;
  firstCheck?: string;
  voices: number;
  traditions: number;
  stageMs?: StageTimings;
  /** First request served by this instance — cold starts explain tail latency honestly. */
  coldStart?: boolean;
  /** Every rejected attempt's full violation set, in order. Empty when nothing was rejected. */
  rejections?: RejectedAttempt[];
};

export type TeachRun = { result: TeacherResult; meta: TeachMeta };

// A safe-to-stream preview of a retrieved source. This is CORPUS text (never
// model output), so it can be shown to the user before/while composing.
export interface SourcePreview {
  sourceId: string;
  author: string;
  sourceTitle: string;
  tradition: string | null;
  content: string;
  score: number;
}

// Progress events emitted as the pipeline runs. The ONLY payloads that carry
// text to the client are `retrieved` (corpus) and the final `done` result
// (verifier-passed for `composed`). Raw model output is never emitted.
export type TeacherEvent =
  | { stage: 'retrieving' }
  | { stage: 'retrieved'; sources: SourcePreview[]; traditions: number }
  | { stage: 'composing'; attempt: number }
  | { stage: 'verifying'; attempt: number }
  | { stage: 'rejected'; attempt: number }
  | { stage: 'done'; result: TeacherResult };

const RETRIEVE_K = 6;
const COMPOSE_VOICES = 5;

// Bounds on the persisted violation payload (verdict 2026-08-15 §7). `message` and `span` are
// model-authored strings; a runaway generation must not be able to write an unbounded log line.
const MAX_VIOLATIONS_PER_ATTEMPT = 12;
const MAX_VIOLATION_FIELD_CHARS = 300;

function selectVoices(pool: RetrievedChunk[], n: number): RetrievedChunk[] {
  if (pool.length <= n) return pool;
  const top = pool.slice(0, n);
  const traditionsInTop = new Set(top.map((r) => r.metadata.tradition ?? 'unknown'));
  if (traditionsInTop.size >= 2) return top;
  const soleTradition = [...traditionsInTop][0];
  const other = pool.find((r) => (r.metadata.tradition ?? 'unknown') !== soleTradition);
  if (!other) return top;
  return [...top.slice(0, n - 1), other];
}

function firstViolationCheck(violations: Violation[]): string | undefined {
  return violations[0]?.check;
}

function deadlineExceeded(startedAt: number, maxDurationMs: number): boolean {
  return Date.now() - startedAt >= maxDurationMs - 2_000; // 2s slack for fallback response
}

// Full teacher pipeline: retrieve → compose → verify → retry-with-feedback →
// fallback. The verifier gates every composed answer; a failed generation is
// never returned (or emitted) as `composed`. `onEvent` streams pipeline STAGES
// (not tokens): callers render progress + the safe retrieved sources during the
// wait, then the verified result on `done`.
// Which register LANES to fire, caller-controlled (the exegetical commentary
// retrieval below is NOT gated by this — it's the always-on core answer, never
// filtered). Each flag defaults to true; a lane set to false is skipped outright
// (never fetched), not fetched-then-hidden.
export type LaneFlags = { songVerse?: boolean; sermons?: boolean; theology?: boolean; historians?: boolean };

// Cold-start visibility (B1): the first request on a fresh serverless instance pays module
// init + connection warmup; the flag lets the measurement run separate that tail honestly.
const instance = { served: 0 };

export async function teach(
  query: string,
  opts: { onEvent?: (e: TeacherEvent) => void; maxDurationMs?: number; lanes?: LaneFlags; userId?: string } = {},
): Promise<TeachRun> {
  const emit = opts.onEvent ?? (() => {});
  const maxDurationMs = opts.maxDurationMs ?? ASK_MAX_DURATION_MS;
  const composeMs = composeTimeoutMs(maxDurationMs);
  const startedAt = Date.now();
  const lanes = opts.lanes ?? {};
  let attempts = 0;
  let firstCheck: string | undefined;
  const stageMs: StageTimings = { embed: 0, retrieve: 0, lanes: 0, compose: [], verify: [], total: 0 };
  const coldStart = instance.served++ === 0;
  // Verdict 2026-08-15 step 1: keep every rejection, not just the first check's name. Bounded at
  // the source so a pathological attempt cannot write an unbounded log line.
  const rejections: RejectedAttempt[] = [];
  const recordRejection = (attempt: number, violations: Violation[]): void => {
    rejections.push({
      attempt,
      violations: violations.slice(0, MAX_VIOLATIONS_PER_ATTEMPT).map((v) => ({
        check: v.check,
        message: v.message.slice(0, MAX_VIOLATION_FIELD_CHARS),
        ...(v.span === undefined ? {} : { span: v.span.slice(0, MAX_VIOLATION_FIELD_CHARS) }),
      })),
    });
  };

  const finish = (result: TeacherResult, meta: Omit<TeachMeta, 'attempts' | 'firstCheck' | 'stageMs' | 'coldStart' | 'rejections'>): TeachRun => {
    emit({ stage: 'done', result });
    stageMs.total = Date.now() - startedAt;
    return { result, meta: { attempts, firstCheck, ...meta, stageMs, coldStart, rejections } };
  };

  emit({ stage: 'retrieving' });
  let stageStart = Date.now();
  const queryVec = await embedQuery(query);
  stageMs.embed = Date.now() - stageStart;
  const intent = resolveIntent(query);
  const ranges = intent.inject;
  const songVersePromise = lanes.songVerse === false ? Promise.resolve([]) : retrieveSongVerse(queryVec, ranges);
  const sermonPromise = lanes.sermons === false ? Promise.resolve([]) : retrieveSermonLane(queryVec, ranges);
  const theologyPromise = lanes.theology === false ? Promise.resolve([]) : retrieveTheologyLane(queryVec, ranges);
  // The historian lane fires by default like the others. CORRECTED 2026-08-18: this used to say
  // the lane stayed inert, and its result absent from the payload, until an owner serve-flip. The
  // flip has landed — all 6,492 historian rows are served and the payload IS attached. See
  // retrieve.ts, which carries the measurement and the B031 consequence.
  // FLIPPED to explicit OPT-IN 2026-08-20 (owner decision #4): the voices picker no longer offers
  // History, so an absent flag must mean OFF — under the old `=== false` default, removing the
  // checkbox would have made this lane run on EVERY ask with no way to disable it, the exact
  // inversion of the standalone ruling. Nothing sends true anymore; the lane is dormant until the
  // §2b data retirement (owner-gated) removes its rows.
  const historianPromise = lanes.historians === true ? retrieveHistorianLane(queryVec, ranges) : Promise.resolve([]);
  // Slice 4: the asker's own uploads as an ADDITIVE voice set (SERMON_SEARCH_DESIGN §7). Fires
  // only for an identified asker — the eval harness (/api/eval/bait) passes no userId, so the
  // lane is inert there and eval reproducibility is unchanged. Fail-soft inside the lane.
  const userVoicesPromise = opts.userId ? retrieveUserVoices(opts.userId, queryVec) : Promise.resolve([] as UserVoice[]);
  stageStart = Date.now();
  const retrieval = await retrieveCommentary(queryVec, RETRIEVE_K, { query });
  stageMs.retrieve = Date.now() - stageStart;
  // Reader deep-link ordinals for the result cards. Started the moment retrieval resolves and
  // awaited only where the rows cross the response boundary (the two `finish` calls that carry
  // `retrieval`), so the one Neon round-trip overlaps compose + verify — 74% of the wall (D4) —
  // rather than sitting serially after retrieval, which is where an await beside the lanes put it
  // (the lanes start BEFORE retrieveCommentary and have usually settled by now; deep-audit
  // 2026-09-06). Nothing between here and those awaits reads the field: selectVoices, the prompt,
  // the corpus lookup and the verifier all project named fields (section-locate.ts). The promise
  // never rejects, so deferring the await cannot surface as an unhandled rejection.
  const ordinalsPromise = attachSectionOrdinals(retrieval);
  stageStart = Date.now();
  const [songVerse, sermons, theology, historians, userVoices] = await Promise.all([songVersePromise, sermonPromise, theologyPromise, historianPromise, userVoicesPromise]);
  stageMs.lanes = Date.now() - stageStart;
  const withRegister = <T extends TeacherResult>(r: T): T => {
    if (r.kind === 'empty') return r;
    let out = r;
    if (songVerse.length > 0) out = { ...out, song_verse: songVerse };
    if (sermons.length > 0) out = { ...out, sermons };
    if (theology.length > 0) out = { ...out, theology };
    if (historians.length > 0) out = { ...out, historians };
    return out;
  };
  if (retrieval.length === 0) {
    return finish({ kind: 'empty', reason: 'No relevant sources found for this question.' }, { voices: 0, traditions: 0 });
  }

  if (!hasPassageCoverage(retrieval.map((r) => r.metadata), intent.floor)) {
    return finish(
      { kind: 'empty', reason: `Our corpus has no commentary on ${formatVerseId(intent.floor[0]!.start)} yet.` },
      { voices: 0, traditions: 0 },
    );
  }

  // COUNTED THE WAY THE VERIFIER COUNTS. This number is rendered to the reader as
  // "across N traditions" (ask-client.tsx:673), and it was built from RAW metadata strings while
  // the `diversity_traditions` gate that gives it meaning folds case (verifier/v1.ts:302-320, via
  // normalizeForMatch). The corpus carries the case pairs that make the two disagree — measured
  // 2026-08-18 on dev: Methodist/methodist 26,633 rows, Patristic/patristic 13,971,
  // Nonconformist/nonconformist 6,367; Augustine alone is served under both `patristic` and
  // `Patristic`. So a reader could be told "2 traditions" for a retrieval the verifier counts as
  // one — an overstatement of attribution breadth on a product whose whole guarantee is
  // attribution.
  //
  // This does NOT change retrieval, composition, or the gate: the floor already normalised and
  // was never defeatable this way (independently re-measured 2026-08-18 — the claim that it was
  // is REFUTED). It changes only the count shown, from a number nothing computed against to the
  // same number the gate uses.
  const voices = selectVoices(retrieval, COMPOSE_VOICES);

  // D46 (DEEP_SWEEP): this event used to be built from `retrieval` (RETRIEVE_K = 6) while the
  // composer and verifier only ever see `voices` (COMPOSE_VOICES = 5). Two claims the answer
  // could not honour: "across N traditions" counted a tradition present ONLY in the dropped
  // chunk, and the preview showed that chunk's full text as a "source" the answer can never
  // cite, because the composer was never shown it. The 2026-08-18 fix normalised the NUMBER the
  // way the verifier counts and stopped one layer short — it kept computing it over the wrong
  // set. Emitted after selectVoices for that reason; the normalisation it added is kept.
  const traditions = new Set(
    voices.map((r) => normalizeForMatch(r.metadata.tradition ?? 'unknown')),
  );
  emit({
    stage: 'retrieved',
    traditions: traditions.size,
    sources: voices.map((r) => ({
      sourceId: r.sourceId,
      author: r.metadata.author,
      sourceTitle: r.metadata.sourceTitle,
      tradition: r.metadata.tradition,
      content: r.content,
      score: r.score,
    })),
  });

  const voiceTraditions = new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'));
  const metaBase = { voices: voices.length, traditions: voiceTraditions.size };
  const systemPrompt = buildSystemPrompt();
  // User voices are APPENDED to the composer's source list (prompt-local ids continue after
  // the corpus voices), never merged into `voices`: the traditions count, the diversity
  // floors, and RetrievalContext are all judged on CORPUS availability only — sectionIds and
  // traditions below stay corpus-only (the RetrievalContext.traditions caveat, DESIGN.md;
  // appending user ids would raise requiredVoices on sparse retrieval past what corpus
  // sections can clear).
  const userLibraryBlock = formatUserLibrarySources(userVoices, voices.length + 1);
  const userPrompt = userLibraryBlock
    ? `${buildUserPrompt(query, voices)}\n\n${userLibraryBlock}`
    : buildUserPrompt(query, voices);
  const corpusLookup = buildCorpusLookup(voices, userVoices);
  const sectionAttributions = [
    ...voices.map((r) => ({
      author: r.metadata.author,
      work: r.metadata.sourceTitle,
      slug: r.metadata.work,
      tradition: r.metadata.tradition ?? 'unknown',
      body: r.content,
    })),
    ...userVoices.map((v) => ({
      author: 'You',
      work: v.title,
      tradition: 'unknown',
      body: v.text,
      origin: 'user_library' as const,
    })),
  ];
  const retrievalContext = {
    sectionIds: voices.map((_, i) => i + 1),
    traditions: [...voiceTraditions],
  };

  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (deadlineExceeded(startedAt, maxDurationMs)) {
      lastViolations = lastViolations.length > 0
        ? lastViolations
        : [{ check: 'deadline', message: 'Compose retry budget exhausted before maxDuration' }];
      if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
      break;
    }

    if (attempt > 0) emit({ stage: 'rejected', attempt: attempt - 1 });
    emit({ stage: 'composing', attempt });

    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations found:\n${lastViolations
            .map((v) => `- [${v.check}] ${v.message}`)
            .join('\n')}\n\nFix these violations and respond again with valid JSON.`;

    attempts++;
    let raw: string;
    const composeStart = Date.now();
    try {
      raw = await compose(systemPrompt, prompt, { timeoutMs: composeMs });
      stageMs.compose.push(Date.now() - composeStart);
    } catch (e) {
      stageMs.compose.push(Date.now() - composeStart);
      lastViolations = [{ check: 'llm_error', message: (e as Error).message }];
      if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
      recordRejection(attempt, lastViolations);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = normalizeContract(JSON.parse(raw), sectionAttributions);
    } catch {
      lastViolations = [{ check: 'json_parse', message: 'Response is not valid JSON' }];
      if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
      recordRejection(attempt, lastViolations);
      continue;
    }

    emit({ stage: 'verifying', attempt });
    const verifyStart = Date.now();
    const result = await verifyV1(parsed, corpusLookup, retrievalContext);
    stageMs.verify.push(Date.now() - verifyStart);
    if (result.ok) {
      await ordinalsPromise; // the rows are about to ship; their deep-link ordinals ride along
      return finish(withRegister({ kind: 'composed', response: parsed as TeacherResponse, retrieval }), metaBase);
    }
    lastViolations = result.violations;
    if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
    recordRejection(attempt, lastViolations);
  }

  // Strip before this crosses the response boundary: same bounds as recordRejection, minus
  // `span` entirely. meta.rejections keeps its own bounded copy for the server-only log.
  const clientViolations = lastViolations.slice(0, MAX_VIOLATIONS_PER_ATTEMPT).map((v) => ({
    check: v.check,
    message: v.message.slice(0, MAX_VIOLATION_FIELD_CHARS),
  }));
  await ordinalsPromise; // as above — the fallback ships the same rows
  return finish(withRegister({ kind: 'fallback', retrieval, violations: clientViolations }), metaBase);
}
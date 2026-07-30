import 'server-only';
import type { TeacherResponse } from '@/contract/types';
import type { Violation } from '@/verifier/types';
import { verifyV1 } from '@/verifier/v1';
import { embedQuery, compose } from './deepinfra';
import { retrieveCommentary, retrieveSongVerse, retrieveSermonLane, retrieveTheologyLane, type RetrievedChunk, type SongVerseChunk, type RegisterLaneChunk } from './retrieve';
import { hasPassageCoverage } from './routing';
import { resolveIntent } from '../../bible/pericopes';
import { formatVerseId } from '../../bible/verse-id';
import { buildCorpusLookup } from './corpus';
import { normalizeContract } from './normalize-contract';
import { buildSystemPrompt, buildUserPrompt } from './prompt';
import {
  MAX_RETRIES,
  TEACH_MAX_DURATION_MS,
  composeTimeoutMs,
} from './teach-budget';

export { MAX_RETRIES, TEACH_MAX_DURATION_MS, composeTimeoutMs, teachBudgetFits } from './teach-budget';

// Register-lane payloads (song_verse, sermons, theology) ride alongside the
// exegetical answer — labeled, retrieve-and-quote, never composed/floored.
type LanePayloads = { song_verse?: SongVerseChunk[]; sermons?: RegisterLaneChunk[]; theology?: RegisterLaneChunk[] };
export type TeacherResult =
  | ({ kind: 'composed'; response: TeacherResponse; retrieval: RetrievedChunk[] } & LanePayloads)
  | ({ kind: 'fallback'; retrieval: RetrievedChunk[]; violations: Violation[] } & LanePayloads)
  | { kind: 'empty'; reason: string };

/** Observability fields for ask_outcome — no question text, no secrets. */
export type TeachMeta = {
  attempts: number;
  firstCheck?: string;
  voices: number;
  traditions: number;
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
export async function teach(
  query: string,
  opts: { onEvent?: (e: TeacherEvent) => void; maxDurationMs?: number } = {},
): Promise<TeachRun> {
  const emit = opts.onEvent ?? (() => {});
  const maxDurationMs = opts.maxDurationMs ?? TEACH_MAX_DURATION_MS;
  const composeMs = composeTimeoutMs(maxDurationMs);
  const startedAt = Date.now();
  let attempts = 0;
  let firstCheck: string | undefined;

  const finish = (result: TeacherResult, meta: Omit<TeachMeta, 'attempts' | 'firstCheck'>): TeachRun => {
    emit({ stage: 'done', result });
    return { result, meta: { attempts, firstCheck, ...meta } };
  };

  emit({ stage: 'retrieving' });
  const queryVec = await embedQuery(query);
  const intent = resolveIntent(query);
  const ranges = intent.inject;
  const songVersePromise = retrieveSongVerse(queryVec, ranges);
  const sermonPromise = retrieveSermonLane(queryVec, ranges);
  const theologyPromise = retrieveTheologyLane(queryVec, ranges);
  const retrieval = await retrieveCommentary(queryVec, RETRIEVE_K, { query });
  const [songVerse, sermons, theology] = await Promise.all([songVersePromise, sermonPromise, theologyPromise]);
  const withRegister = <T extends TeacherResult>(r: T): T => {
    if (r.kind === 'empty') return r;
    let out = r;
    if (songVerse.length > 0) out = { ...out, song_verse: songVerse };
    if (sermons.length > 0) out = { ...out, sermons };
    if (theology.length > 0) out = { ...out, theology };
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

  const traditions = new Set(retrieval.map((r) => r.metadata.tradition ?? 'unknown'));
  emit({
    stage: 'retrieved',
    traditions: traditions.size,
    sources: retrieval.map((r) => ({
      sourceId: r.sourceId,
      author: r.metadata.author,
      sourceTitle: r.metadata.sourceTitle,
      tradition: r.metadata.tradition,
      content: r.content,
      score: r.score,
    })),
  });

  const voices = selectVoices(retrieval, COMPOSE_VOICES);
  const voiceTraditions = new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'));
  const metaBase = { voices: voices.length, traditions: voiceTraditions.size };
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, voices);
  const corpusLookup = buildCorpusLookup(voices);
  const sectionAttributions = voices.map((r) => ({
    author: r.metadata.author,
    work: r.metadata.sourceTitle,
    tradition: r.metadata.tradition ?? 'unknown',
    body: r.content,
  }));
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
    try {
      raw = await compose(systemPrompt, prompt, { timeoutMs: composeMs });
    } catch (e) {
      lastViolations = [{ check: 'llm_error', message: (e as Error).message }];
      if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
      continue;
    }

    let parsed: unknown;
    try {
      parsed = normalizeContract(JSON.parse(raw), sectionAttributions);
    } catch {
      lastViolations = [{ check: 'json_parse', message: 'Response is not valid JSON' }];
      if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
      continue;
    }

    emit({ stage: 'verifying', attempt });
    const result = await verifyV1(parsed, corpusLookup, retrievalContext);
    if (result.ok) {
      return finish(withRegister({ kind: 'composed', response: parsed as TeacherResponse, retrieval }), metaBase);
    }
    lastViolations = result.violations;
    if (!firstCheck) firstCheck = firstViolationCheck(lastViolations);
  }

  return finish(withRegister({ kind: 'fallback', retrieval, violations: lastViolations }), metaBase);
}
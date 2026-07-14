import 'server-only';
import type { TeacherResponse } from '@/contract/types';
import type { Violation } from '@/verifier/types';
import { verifyV1 } from '@/verifier/v1';
import { embedQuery, compose } from './deepinfra';
import { retrieveCommentary, type RetrievedChunk } from './retrieve';
import { buildCorpusLookup } from './corpus';
import { resolveIntent } from '../../bible/pericopes';
import { normalizeContract } from './normalize-contract';
import { buildSystemPrompt, buildUserPrompt } from './prompt';

export type TeacherResult =
  | { kind: 'composed'; response: TeacherResponse; retrieval: RetrievedChunk[] }
  | { kind: 'fallback'; retrieval: RetrievedChunk[]; violations: Violation[] }
  | { kind: 'empty'; reason: string };

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

// Two retries. Diagnostics traced the residual fallbacks to verbatim-quote
// drift on long flowing-prose sources (the model quotes an opening sentence,
// then stitches on a non-adjacent one). The retry carries the specific
// violations back to the model, so a second retry meaningfully lifts recovery
// on exactly that class; combined with the snap-to-source repair in
// normalize-contract, most drift is caught before the last attempt. Compose is
// ~4–5s, so a worst-case 3 attempts (~15s) is an acceptable tail for the
// accuracy gate. Still fail-closed: a failed final attempt lands in fallback.
const MAX_RETRIES = 2;

// Retrieve a pool (for the source preview + diversity headroom) and compose over
// the top few voices. Latency is output-bound (the model emits ~750 tokens
// whether it's shown 3 sources or 6), so a smaller compose set does NOT buy
// speed — it only trades away the model's room to skip an off-topic
// high-ranked retrieval. 5 keeps the prompt lean while leaving that headroom.
const RETRIEVE_K = 6;
const COMPOSE_VOICES = 5;

// Pick the top N voices by score, but guarantee ≥2 traditions are present when
// the pool offers them, so the verifier's diversity floor stays satisfiable.
function selectVoices(pool: RetrievedChunk[], n: number): RetrievedChunk[] {
  if (pool.length <= n) return pool;
  const top = pool.slice(0, n); // pool is score-ordered
  const traditionsInTop = new Set(top.map((r) => r.metadata.tradition ?? 'unknown'));
  if (traditionsInTop.size >= 2) return top;
  const soleTradition = [...traditionsInTop][0];
  const other = pool.find((r) => (r.metadata.tradition ?? 'unknown') !== soleTradition);
  if (!other) return top; // pool is single-tradition; nothing to diversify with
  return [...top.slice(0, n - 1), other];
}

// Full teacher pipeline: retrieve → compose → verify → retry-with-feedback →
// fallback. The verifier gates every composed answer; a failed generation is
// never returned (or emitted) as `composed`. `onEvent` streams pipeline STAGES
// (not tokens): callers render progress + the safe retrieved sources during the
// wait, then the verified result on `done`.
export async function teach(
  query: string,
  opts: { onEvent?: (e: TeacherEvent) => void } = {},
): Promise<TeacherResult> {
  const emit = opts.onEvent ?? (() => {});
  const finish = (result: TeacherResult): TeacherResult => {
    emit({ stage: 'done', result });
    return result;
  };

  emit({ stage: 'retrieving' });
  const queryVec = await embedQuery(query);
  const retrieval = await retrieveCommentary(queryVec, RETRIEVE_K, { query });
  if (retrieval.length === 0) {
    return finish({ kind: 'empty', reason: 'No relevant sources found for this question.' });
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

  // Compose over the top few voices; the verifier and prompt see exactly this set.
  const voices = selectVoices(retrieval, COMPOSE_VOICES);
  const voiceTraditions = new Set(voices.map((r) => r.metadata.tradition ?? 'unknown'));
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(query, voices);
  const corpusLookup = buildCorpusLookup(voices);
  // Authoritative attribution per cited section_id (1-based), used to backfill
  // what the model typed so a correct citation can't be rejected over a mislabel.
  const sectionAttributions = voices.map((r) => ({
    author: r.metadata.author,
    work: r.metadata.sourceTitle,
    tradition: r.metadata.tradition ?? 'unknown',
    body: r.content, // enables snap-to-source quote repair in normalizeContract
  }));
  const retrievalContext = {
    sectionIds: voices.map((_, i) => i + 1),
    traditions: [...voiceTraditions],
    // Verse ranges the query itself named — the passages_grounded screen treats these
    // (plus any voice-block anchor) as the only legitimate grounds for a passage.
    queryRanges: resolveIntent(query).inject,
  };

  let lastViolations: Violation[] = [];

  for (let attempt = 0; attempt <= MAX_RETRIES; attempt++) {
    if (attempt > 0) emit({ stage: 'rejected', attempt: attempt - 1 });
    emit({ stage: 'composing', attempt });

    const prompt =
      attempt === 0
        ? userPrompt
        : `${userPrompt}\n\n--- PREVIOUS ATTEMPT REJECTED ---\nViolations found:\n${lastViolations
            .map((v) => `- [${v.check}] ${v.message}`)
            .join('\n')}\n\nFix these violations and respond again with valid JSON.`;

    let raw: string;
    try {
      raw = await compose(systemPrompt, prompt);
    } catch (e) {
      lastViolations = [{ check: 'llm_error', message: (e as Error).message }];
      continue;
    }

    let parsed: unknown;
    try {
      // Coerce quoted numeric IDs and backfill attribution from the cited
      // section BEFORE verifying. This is lossless normalization, not a relaxed
      // gate: the verifier below still enforces verbatim quotes, valid anchors/
      // passages, screens, and diversity, and still fails closed.
      parsed = normalizeContract(JSON.parse(raw), sectionAttributions);
    } catch {
      lastViolations = [{ check: 'json_parse', message: 'Response is not valid JSON' }];
      continue;
    }

    // The verifier runs server-side here, BEFORE any `done` event is emitted.
    emit({ stage: 'verifying', attempt });
    const result = await verifyV1(parsed, corpusLookup, retrievalContext);
    if (result.ok) {
      // Return the normalized object: its attribution is the authoritative
      // source attribution the verifier just checked the quote against.
      return finish({ kind: 'composed', response: parsed as TeacherResponse, retrieval });
    }
    lastViolations = result.violations;
  }

  return finish({ kind: 'fallback', retrieval, violations: lastViolations });
}

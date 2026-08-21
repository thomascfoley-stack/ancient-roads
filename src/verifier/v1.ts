// Stage V1: deterministic verifier (OUTPUT_CONTRACT.md §3). No model calls.
// Runs on every teacher response before it reaches the user. Collects ALL
// violations (not fail-fast) so regeneration feedback is complete.
//
// Source of truth: docs/PRINCIPLES.md. This stage enforces the interpretation
// rules I1-I6 (via screens + attribution/quote checks), C1 corpus-only citation
// (section/quote/attribution/verse resolution), and G1 the grounded-example floor
// (diversity). If PRINCIPLES.md changes, these checks change to match it.

import { Ajv2020 } from 'ajv/dist/2020.js';
import contractSchema from '../contract/schema.json' with { type: 'json' };
import type { TeacherResponse, VerseRange, VoiceBlock } from '../contract/types';
import { isStructurallyValidVerseId, formatVerseId } from '../bible/verse-id';
import { isNormalizedSubstring, normalizeForMatch } from './normalize';
import { runScreens } from './screens';
import {
  type CorpusLookup,
  type RetrievalContext,
  type TeacherContractConfig,
  type VerifierResult,
  type Violation,
  DEFAULT_CONTRACT_CONFIG,
} from './types';

const ajv = new Ajv2020({ allErrors: true });
const validateSchema = ajv.compile(contractSchema);

export async function verifyV1(
  response: unknown,
  lookup: CorpusLookup,
  retrieval: RetrievalContext,
  config: TeacherContractConfig = DEFAULT_CONTRACT_CONFIG,
): Promise<VerifierResult> {
  const violations: Violation[] = [];

  // 1. Contract schema. Anything malformed stops here: later checks assume shape.
  if (!validateSchema(response)) {
    for (const err of validateSchema.errors ?? []) {
      // `err.params` carries the ONE datum a fix needs and this line used to drop it: for
      // `additionalProperties` it names the offending property, for `required` the missing one,
      // for `const` the allowed value. Without it every such rejection read "/blocks/1 must NOT
      // have additional properties" — true, unactionable, and identical across every cause.
      // Measured 2026-08-15: additionalProperties was the single most common schema rejection,
      // and no one could say which property because it was never recorded.
      //
      // This text is not only diagnostic — it is fed back to the model as the retry instruction
      // (teach.ts builds the retry prompt from `violations`), so naming the property tells the
      // next attempt exactly what to remove instead of asking it to guess.
      const params = err.params as Record<string, unknown> | undefined;
      const detail = params && Object.keys(params).length > 0
        ? ` (${Object.entries(params).map(([k, v]) => `${k}=${JSON.stringify(v)}`).join(', ')})`
        : '';
      violations.push({
        check: 'schema',
        message: `${err.instancePath || '/'} ${err.message ?? 'invalid'}${detail}`,
      });
    }
    return { ok: false, violations };
  }
  const r = response as unknown as TeacherResponse;

  const voiceBlocks: Array<{ block: VoiceBlock; index: number }> = [];
  // Passage items collected for the post-loop grounding screen. Filled only with
  // structurally-valid ranges (invalid ones already raised their own violation).
  const passageChecks: Array<{ item: VerseRange; index: number }> = [];

  for (const [index, block] of r.blocks.entries()) {
    switch (block.type) {
      case 'voice': {
        voiceBlocks.push({ block, index });
        const section = await lookup.getSection(block.section_id, block.attribution.origin);
        if (!section) {
          violations.push({
            check: 'section_resolves',
            blockIndex: index,
            message: `section_id ${block.section_id} (origin ${block.attribution.origin}) does not resolve`,
          });
          break; // downstream checks need the section
        }
        // Quote must be verbatim (normalized) within the cited section.
        if (!isNormalizedSubstring(block.quote, section.body)) {
          violations.push({
            check: 'quote_verbatim',
            blockIndex: index,
            message: `quote is not a normalized substring of section ${block.section_id}`,
            span: block.quote,
          });
        }
        // Attribution must match the sources table: the model cannot invent
        // "what Spurgeon said," it can only mis-select.
        const a = block.attribution;
        if (normalizeForMatch(a.author) !== normalizeForMatch(section.source.author)) {
          violations.push({
            check: 'attribution_author',
            blockIndex: index,
            message: `attribution.author "${a.author}" does not match source author "${section.source.author}"`,
          });
        }
        const workMatches =
          normalizeForMatch(a.work) === normalizeForMatch(section.source.title) ||
          (section.heading !== undefined &&
            normalizeForMatch(a.work) === normalizeForMatch(section.heading));
        if (!workMatches) {
          violations.push({
            check: 'attribution_work',
            blockIndex: index,
            message: `attribution.work "${a.work}" matches neither source title "${section.source.title}" nor section heading`,
          });
        }
        if (normalizeForMatch(a.tradition) !== normalizeForMatch(section.source.tradition)) {
          violations.push({
            check: 'attribution_tradition',
            blockIndex: index,
            message: `attribution.tradition "${a.tradition}" does not match source tradition "${section.source.tradition}"`,
          });
        }
        // Anchors: structurally valid canonical verse IDs, start <= end, AND actually within
        // the verse range this section is indexed to. The last check is the load-bearing one
        // (LONG_NIGHT H2): anchors are model-self-reported, so without it a model can quote a
        // real Genesis section, tag it with a Revelation anchor, and that anchor then grounds an
        // unrelated Revelation passage in passages_grounded below. An anchor must point at what
        // the cited source is actually speaking on — its own verse range — not wherever the model
        // says. Skipped only when the lookup didn't supply a range (legacy/CLI fixtures).
        for (const anchor of block.anchors ?? []) {
          if (!isStructurallyValidVerseId(anchor.start) || !isStructurallyValidVerseId(anchor.end)) {
            violations.push({
              check: 'anchor_valid',
              blockIndex: index,
              message: `anchor ${anchor.start}-${anchor.end} is not a valid canonical verse range`,
            });
          } else if (anchor.start > anchor.end) {
            violations.push({
              check: 'anchor_order',
              blockIndex: index,
              message: `anchor start ${formatVerseId(anchor.start)} is after end ${formatVerseId(anchor.end)}`,
            });
          } else if (
            section.verses &&
            !(
              // (a) overlaps the section's own range (voice speaks on it), AND
              anchor.start <= section.verses.end && section.verses.start <= anchor.end &&
              // (b) stays within the section's chapter span — a section indexed
              // narrowly (often one verse) is legitimately commented across its
              // pericope, so full containment is too strict; but an anchor may NOT
              // sprawl beyond the section's chapters. This is what kills the
              // canon-spanning anchor (Gen 1:1–Rev 22:21) that overlap alone let
              // through to ground ANY passage below (A6 line-by-line 2026-07-17).
              Math.floor(anchor.start / 1000) >= Math.floor(section.verses.start / 1000) &&
              Math.floor(anchor.end / 1000) <= Math.floor(section.verses.end / 1000)
            )
          ) {
            violations.push({
              check: 'anchor_offbase',
              blockIndex: index,
              message: `anchor ${formatVerseId(anchor.start)}-${formatVerseId(anchor.end)} is outside section ${section.id}'s own range/chapters ${formatVerseId(section.verses.start)}-${formatVerseId(section.verses.end)} (${section.source.author}) — an anchor must point at what the cited source discusses, within its chapters`,
            });
          }
        }
        break;
      }

      case 'passages': {
        for (const item of block.items) {
          if (!isStructurallyValidVerseId(item.start) || !isStructurallyValidVerseId(item.end)) {
            violations.push({
              check: 'passage_valid',
              blockIndex: index,
              message: `passage ${item.start}-${item.end} is not a valid canonical verse range`,
            });
            continue;
          }
          if (item.start > item.end) {
            violations.push({
              check: 'passage_order',
              blockIndex: index,
              message: `passage start ${formatVerseId(item.start)} is after end ${formatVerseId(item.end)}`,
            });
          } else {
            passageChecks.push({ item, index }); // well-ordered ⇒ eligible for the grounding screen
          }
          const translation = await lookup.getTranslation(item.translation);
          if (!translation || !translation.isActive || !translation.licensedForDisplay) {
            violations.push({
              check: 'translation_licensed',
              blockIndex: index,
              message: `translation "${item.translation}" is not active and licensed for display`,
            });
            continue;
          }
          const [startExists, endExists] = await Promise.all([
            lookup.verseExists(item.translation, item.start),
            lookup.verseExists(item.translation, item.end),
          ]);
          if (!startExists || !endExists) {
            violations.push({
              check: 'passage_exists',
              blockIndex: index,
              message: `passage ${formatVerseId(item.start)}-${formatVerseId(item.end)} not found in "${item.translation}"`,
            });
          }
        }
        break;
      }

      case 'reading': {
        for (const item of block.items) {
          const source = await lookup.getSource(item.source_id);
          if (!source) {
            violations.push({
              check: 'reading_resolves',
              blockIndex: index,
              message: `reading source_id ${item.source_id} does not resolve`,
            });
          } else if (normalizeForMatch(item.author) !== normalizeForMatch(source.author)) {
            violations.push({
              check: 'reading_attribution',
              blockIndex: index,
              message: `reading author "${item.author}" does not match source author "${source.author}"`,
            });
          }
        }
        break;
      }

      case 'framing':
      case 'prayer_prompt':
        break; // screened below

      default: {
        // FAIL CLOSED on contract drift (CONTENT_GO_LIVE.md decision 6). A block
        // type added to the schema/union without a verifier case must never pass
        // unverified: the `never` binding makes tsc reject the drift at compile
        // time, and if a value still arrives at runtime (schema and types out of
        // step), it is a violation, not a pass. Proven red-first with a seeded
        // block type that returned {ok:true} before this default existed.
        const drifted: never = block;
        violations.push({
          check: 'unknown_block_type',
          blockIndex: index,
          message: `unknown block type "${String((drifted as { type?: unknown }).type)}" — verifier has no rule for it; fail closed`,
        });
        break;
      }
    }

    // Regex screens on ALL assistant-voice text. reading.items[].title and .note
    // are model-authored free text (title is NOT the source title — it is not
    // checked against the resolved source) and were previously unscreened, so an
    // interpretive verdict in a reading note bypassed every screen (A6 line-by-
    // line 2026-07-17). Screen framing/prayer text, voice summaries, AND every
    // reading item's title + note.
    const screenTexts: string[] = [];
    if (block.type === 'framing' || block.type === 'prayer_prompt') screenTexts.push(block.text);
    else if (block.type === 'voice' && block.summary) screenTexts.push(block.summary);
    else if (block.type === 'reading') {
      for (const it of block.items) {
        if (it.title) screenTexts.push(it.title);
        if (it.note) screenTexts.push(it.note);
      }
    }
    for (const text of screenTexts) {
      for (const hit of runScreens(text)) {
        violations.push({
          check: `screen:${hit.rule}`,
          blockIndex: index,
          message: `${hit.label} in ${block.type}`,
          span: hit.span,
        });
      }
    }
  }

  // Grounding rule (G1, interpretation-by-selection): `passages` is a generated CHOICE,
  // not generated prose — the screens defend words, this defends the selection. A passage may
  // be shown ONLY if it intersects a voice-block anchor grounded in the CITED SOURCE SECTION:
  // the anchors above already had to intersect their own section (anchor_offbase), so a
  // surviving anchor means a retrieved source is actually speaking on that passage. The query's
  // own resolveIntent().inject range is a soft-boost retrieval heuristic (false-positive-safe,
  // whole-chapter, "good shepherd insurance") and is NOT an authorization boundary — removed as
  // a grounding source (was: `...retrieval.queryRanges`). Otherwise it is the model's own uncited
  // verse-picking — a doctrinal verdict expressed as a list — and we fail closed.
  // CONTAINMENT, not overlap (A6 line-by-line 2026-07-17): an overlap test let a
  // passage extend far beyond its grounding anchor (anchor Gen 3:1-3 → shown
  // passage Gen 3:1-Rev 22:21 claims the whole canon on a sliver of overlap —
  // interpretation-by-selection). A shown passage must sit WITHIN a single
  // source-grounded anchor; a passage spanning two grounded spans must be two items.
  // TRUST BOUNDARY (SERMON_SEARCH_DESIGN.md §7(b)/(c); defect H4, 2026-08-20 uploader deep
  // dive): user-library voices are ADDITIVE, never load-bearing. They remain legal cited
  // voices — the resolution/quote/attribution/anchor checks above ran on them — but only
  // corpus-origin voices may GROUND a displayed passage or satisfy the diversity floors
  // below. Otherwise a user's own upload could authorize Scripture display or stand in for
  // a second tradition, making the product guarantee circular.
  const corpusVoiceBlocks = voiceBlocks.filter(({ block }) => block.attribution.origin === 'corpus');
  const rangeContains = (outer: VerseRange, inner: VerseRange): boolean => outer.start <= inner.start && inner.end <= outer.end;
  const groundingRanges: VerseRange[] = corpusVoiceBlocks.flatMap(({ block }) => block.anchors ?? []);
  for (const { item, index } of passageChecks) {
    if (!groundingRanges.some((g) => rangeContains(g, item))) {
      violations.push({
        check: 'passages_grounded',
        blockIndex: index,
        message: `passage ${formatVerseId(item.start)}-${formatVerseId(item.end)} is ungrounded: it is not contained within any CORPUS-grounded voice-block anchor (interpretation-by-selection; user_library anchors do not ground display)`,
      });
    }
  }

  // Diversity rule: judged against what retrieval returned, not the corpus.
  // Count DISTINCT source SECTIONS, not raw voice blocks (A6 line-by-line
  // 2026-07-17): two voice blocks quoting the same section are one source, and
  // must not satisfy the >=2-voices floor. Traditions are normalized so raw-string
  // casing/spacing variants of one tradition don't inflate the count.
  //
  // `unassigned` IS NOT A TRADITION — it is the ABSENCE of one, and counting it as a value is
  // what let one man satisfy a floor that exists to require two traditions. Measured on
  // production 2026-08-19: 301 served works / 356,167 rows carry `unassigned`, and 15 people are
  // served under BOTH a real tradition and `unassigned` because the bulk ingest used a different
  // author convention for their later works — Spurgeon under `baptist` AND `unassigned` across 68
  // works, Calvin 53, Schaff 38, Owen 32. An answer quoting Spurgeon twice counted as two
  // traditions and cleared the gate.
  //
  // Dropped from BOTH sides, and both are load-bearing. On the USED side it stops an absent
  // tradition from padding the count. On the AVAILABLE side it stops the gate from ENGAGING on
  // breadth that does not exist: if retrieval offered only `baptist` and `unassigned`, there was
  // never a second tradition to require, and demanding one would fail every answer for a corpus
  // gap rather than for a composition fault.
  //
  // Fixing the DATA instead was measured and rejected: retrieval reads tradition out of
  // `embeddings.metadata`, so it would mean rewriting 336,837 JSONB rows on a table carrying
  // multiple multi-GB HNSW indexes — and it would still miss the people a name-matcher cannot
  // safely join (`J.C. Ryle` / `Ryle, John Charles`, `B.W. Johnson` / `Johnson, Barton Warren`).
  // The backfill remains worth doing for display and genuine breadth; it is not what makes the
  // gate honest. This is.
  const NOT_A_TRADITION = new Set(['unassigned', 'unknown', '']);
  const realTraditions = (xs: readonly (string | null | undefined)[]) =>
    new Set(xs.map((t) => normalizeForMatch(t ?? '')).filter((t) => !NOT_A_TRADITION.has(t)));
  const availableTraditions = realTraditions(retrieval.traditions);
  // Corpus-origin voices only (H4, comment above the grounding screen): a user upload's
  // tradition/section must never satisfy these floors.
  const usedTraditions = realTraditions(corpusVoiceBlocks.map(({ block }) => block.attribution.tradition));
  const distinctVoiceSections = new Set(corpusVoiceBlocks.map(({ block }) => block.section_id));
  const requiredVoices = Math.min(config.minVoices, retrieval.sectionIds.length);
  const requiredTraditions = Math.min(config.minTraditions, availableTraditions.size);
  if (distinctVoiceSections.size < requiredVoices) {
    violations.push({
      check: 'diversity_voices',
      message: `${distinctVoiceSections.size} distinct corpus-origin source section(s) across ${voiceBlocks.length} voice block(s); ${requiredVoices} required given retrieval returned ${retrieval.sectionIds.length} section(s) — user_library voices are additive and do not count`,
    });
  }
  if (availableTraditions.size >= 2 && usedTraditions.size < requiredTraditions) {
    violations.push({
      check: 'diversity_traditions',
      message: `corpus-origin voices span ${usedTraditions.size} tradition(s); ${requiredTraditions} required given retrieval spans ${availableTraditions.size} — user_library voices are additive and do not count`,
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

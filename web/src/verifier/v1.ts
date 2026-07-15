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
      violations.push({
        check: 'schema',
        message: `${err.instancePath || '/'} ${err.message ?? 'invalid'}`,
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
            !(anchor.start <= section.verses.end && section.verses.start <= anchor.end)
          ) {
            violations.push({
              check: 'anchor_offbase',
              blockIndex: index,
              message: `anchor ${formatVerseId(anchor.start)}-${formatVerseId(anchor.end)} is outside section ${section.id}'s own range ${formatVerseId(section.verses.start)}-${formatVerseId(section.verses.end)} (${section.source.author}) — an anchor must point at what the cited source discusses`,
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
    }

    // Regex screens on assistant-voice text (framing, summaries, prayer_prompt).
    const screenable =
      block.type === 'framing' || block.type === 'prayer_prompt'
        ? block.text
        : block.type === 'voice'
          ? block.summary
          : null;
    if (screenable) {
      for (const hit of runScreens(screenable)) {
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
  // not generated prose — the screens defend words, this defends the selection. A passage
  // may be shown ONLY if it intersects a voice-block anchor in THIS response (a source is
  // actually speaking on it) or a range the query itself named (resolveIntent → queryRanges).
  // Otherwise it is the model's own uncited verse-picking — a doctrinal verdict expressed as
  // a list — and we fail closed. Judged after the loop so anchors from any voice count.
  const rangesOverlap = (a: VerseRange, b: VerseRange): boolean => a.start <= b.end && b.start <= a.end;
  const groundingRanges: VerseRange[] = [
    ...voiceBlocks.flatMap(({ block }) => block.anchors ?? []),
    ...(retrieval.queryRanges ?? []),
  ];
  for (const { item, index } of passageChecks) {
    if (!groundingRanges.some((g) => rangesOverlap(item, g))) {
      violations.push({
        check: 'passages_grounded',
        blockIndex: index,
        message: `passage ${formatVerseId(item.start)}-${formatVerseId(item.end)} is ungrounded: it intersects no voice-block anchor and no query-resolved range (interpretation-by-selection)`,
      });
    }
  }

  // Diversity rule: judged against what retrieval returned, not the corpus.
  const availableTraditions = new Set(retrieval.traditions);
  const usedTraditions = new Set(voiceBlocks.map(({ block }) => block.attribution.tradition));
  const requiredVoices = Math.min(config.minVoices, retrieval.sectionIds.length);
  const requiredTraditions = Math.min(config.minTraditions, availableTraditions.size);
  if (voiceBlocks.length < requiredVoices) {
    violations.push({
      check: 'diversity_voices',
      message: `${voiceBlocks.length} voice block(s); ${requiredVoices} required given retrieval returned ${retrieval.sectionIds.length} section(s)`,
    });
  }
  if (availableTraditions.size >= 2 && usedTraditions.size < requiredTraditions) {
    violations.push({
      check: 'diversity_traditions',
      message: `voices span ${usedTraditions.size} tradition(s); ${requiredTraditions} required given retrieval spans ${availableTraditions.size}`,
    });
  }

  return violations.length === 0 ? { ok: true } : { ok: false, violations };
}

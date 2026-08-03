// PlanSpec — the ONLY thing the intake (form today, model later) may produce.
// STUDY_PLANS_DESIGN §2/§3: the LLM parses intent; code generates the
// schedule. The model's job, when it arrives, ends at emitting this object;
// it never emits a date, a verse range, or a day list. Validation is a
// schema-parse at the edge (CLAUDE.md coding standards) with every field
// bounded, because an unbounded spec is an unbounded expansion.

import { BOOK_BY_SLUG } from '@/bible/books';
import { parseRef } from '@/bible/ref-parse';
import { resolveCanonicalGroup } from './canonical-groups';

export type PlanScope =
  | { kind: 'book'; book: string }    // canonical book slug, e.g. 'rom'
  | { kind: 'range'; ref: string }    // a parseable single-book reference, e.g. "Romans 1-8"
  | { kind: 'books'; group: string }; // a reviewed canonical grouping key, e.g. 'pauline-epistles'
// A topic scope ({kind:'topic', workSlug, sectionId}) exists in the topic-matching design
// (docs/PLAN_TOPIC_MATCHING_DESIGN.md) but is not wired here yet — that slice adds it.

export interface PlanSpec {
  scope: PlanScope;
  weeks: number;          // 1..104
  daysPerWeek: number;    // 1..7
  startDate: string;      // 'YYYY-MM-DD', the user's LOCAL calendar date
}

export type SpecOutcome = { ok: true; spec: PlanSpec } | { ok: false; reason: string };

const DATE_RE = /^\d{4}-(0[1-9]|1[0-2])-(0[1-9]|[12]\d|3[01])$/;

/**
 * Narrow unknown input to a PlanSpec or refuse with a reason. Trusts nothing:
 * this is the edge for both the form POST and, later, the model's output.
 */
export function parsePlanSpec(input: unknown): SpecOutcome {
  if (typeof input !== 'object' || input === null) return { ok: false, reason: 'spec must be an object' };
  const o = input as Record<string, unknown>;

  const weeks = Number(o.weeks);
  if (!Number.isInteger(weeks) || weeks < 1 || weeks > 104) {
    return { ok: false, reason: 'weeks must be a whole number from 1 to 104' };
  }
  const daysPerWeek = Number(o.daysPerWeek);
  if (!Number.isInteger(daysPerWeek) || daysPerWeek < 1 || daysPerWeek > 7) {
    return { ok: false, reason: 'daysPerWeek must be a whole number from 1 to 7' };
  }
  const startDate = typeof o.startDate === 'string' ? o.startDate : '';
  if (!DATE_RE.test(startDate)) {
    return { ok: false, reason: 'startDate must be YYYY-MM-DD' };
  }

  const scope = o.scope as Record<string, unknown> | null | undefined;
  if (typeof scope !== 'object' || scope === null) return { ok: false, reason: 'scope is required' };

  if (scope.kind === 'book') {
    const book = typeof scope.book === 'string' ? scope.book.trim().toLowerCase() : '';
    if (!BOOK_BY_SLUG.has(book)) return { ok: false, reason: `unknown book slug "${book}"` };
    return { ok: true, spec: { scope: { kind: 'book', book }, weeks, daysPerWeek, startDate } };
  }
  if (scope.kind === 'range') {
    const ref = typeof scope.ref === 'string' ? scope.ref.trim() : '';
    if (ref.length === 0 || ref.length > 100) return { ok: false, reason: 'range ref must be 1-100 characters' };
    const parsed = parseRef(ref);
    if (!parsed.ok) return { ok: false, reason: `not a reference: ${parsed.reason}` };
    return { ok: true, spec: { scope: { kind: 'range', ref }, weeks, daysPerWeek, startDate } };
  }
  if (scope.kind === 'books') {
    const group = typeof scope.group === 'string' ? scope.group.trim().toLowerCase() : '';
    if (!resolveCanonicalGroup(group)) return { ok: false, reason: `unknown canonical group "${group}"` };
    return { ok: true, spec: { scope: { kind: 'books', group }, weeks, daysPerWeek, startDate } };
  }
  return { ok: false, reason: 'scope.kind must be "book", "range", or "books"' };
}

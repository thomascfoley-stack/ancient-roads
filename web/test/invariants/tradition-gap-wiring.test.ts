// ADR-104, made mechanical.
//
// `traditionGap` takes the corpus filter as a PARAMETER so that exactly one definition of "what the
// corpus serves" exists. The order's words: filter on `embeddings.served = true` via THE canonical
// predicate, "never a second hand-written one". MASTER.md's watchlist records a second copy of a
// predicate as the repo's most-punished defect, and names `routing.ts` as instance 14.
//
// The failure this guards is not exotic. It is someone reading the SQL in tradition-gap.ts, seeing
// `AND ${predicate}`, and typing `served = true` at the call site because it is shorter than an
// import. That is green in every test, produces correct-looking output today, and silently stops
// tracking the corpus the day the definition of "served" changes.
//
// So: the call site must IMPORT LEGAL_CORPUS_FILTER, and must not contain a corpus-filter literal.

import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { corpusPredicate } from '@/lib/user-corpus/tradition-gap';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');
const ROUTE = path.join(SRC, 'app/api/user-corpus/documents/[id]/voices/route.ts');
const route = readFileSync(ROUTE, 'utf8');

describe('the tradition-gap call site uses THE canonical predicate', () => {
  it('imports LEGAL_CORPUS_FILTER from routing.ts', () => {
    expect(route).toMatch(/import \{[^}]*LEGAL_CORPUS_FILTER[^}]*\} from '@\/lib\/teacher\/routing'/);
  });

  it('never hand-writes a corpus filter of its own', () => {
    // Strip comments first: this file's own rationale mentions `served = true`, and so does the
    // route's. A guard that fired on prose would be turned off within a week.
    const code = route.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
    expect(code).not.toMatch(/served\s*=\s*true/);
    expect(code).not.toMatch(/`\(served\)`/);
  });

  it('brands the constant rather than any runtime value', () => {
    // corpusPredicate(<expression>) where the expression is not the imported constant would defeat
    // the branded type's entire purpose.
    expect(route).toMatch(/corpusPredicate\(LEGAL_CORPUS_FILTER\)/);
  });

  it('the predicate it passes is the one routing.ts actually exports', () => {
    // Non-vacuity plus drift: if routing.ts changes what it serves, this is the assertion that
    // notices the join is still asking for the old thing.
    expect(LEGAL_CORPUS_FILTER).toBe('(served)');
    expect(String(corpusPredicate(LEGAL_CORPUS_FILTER))).toBe(LEGAL_CORPUS_FILTER);
  });

  it('refuses a predicate carrying a statement terminator or comment marker', () => {
    // The tripwire is not a sanitiser and does not claim to be; it exists so an accidental
    // corpusPredicate(userInput) fails loudly instead of splicing.
    expect(() => corpusPredicate('served = true; DROP TABLE embeddings')).toThrow();
    expect(() => corpusPredicate('served = true -- x')).toThrow();
    expect(() => corpusPredicate('served /* x */')).toThrow();
  });

  it('only joins for a document that finished indexing', () => {
    // Anchors are what the join reads and they do not exist before `ready`, so a join on a queued
    // document returns nothing and would render as "the tradition is silent on this" -- a false
    // statement about the corpus rather than a true one about the document's progress.
    expect(route).toMatch(/status !== 'ready'/);
    expect(route).toMatch(/pending: true/);
  });
});

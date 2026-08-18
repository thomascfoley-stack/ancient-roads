// A USER-TABLE WRITER WITH NO CALLER IS A FEATURE THAT SILENTLY DOES NOT EXIST.
//
// This repo has now shipped the same defect three times, and each instance was invisible for
// months because the symptom is ABSENCE, not error:
//
//   • the bookmark write path had zero call sites while the table and its tests existed (A7b);
//   • `saveReadingProgress` had zero call sites, so `listContinueReading` could only ever return
//     `[]` and the Library hub's "Continue reading" section was permanently absent (ledger N1);
//   • `setShelf` / `removeFromLibrary` still have zero call sites today (ledger N3).
//
// Every ordinary check stays green through this. The function is correct, its types are correct,
// its RLS policy is correct, and a unit test of it passes. What is missing is a CALLER, which no
// test of the function can see. So the property has to be stated at the module graph: a function
// that writes a user row exists to be called, and one that nothing calls is either an unbuilt
// feature or a broken one — never a neutral fact.
//
// ── WHY THIS IS DERIVED, AND WHERE THE HAND-MAINTAINED PART IS ────────────────────────────────
//
// MASTER.md's failure-mode watchlist is at fifteen instances of "a hand-maintained expected set
// that nothing enforces", and its corollary is that a guard whose expected set is typed by the
// same hand that typed the thing it guards is not a second opinion. So:
//
//   the POPULATION is derived — every lib module that reaches user rows through `runAsUser`,
//   and within those, every exported function whose body carries a SQL write verb. Add a new
//   store module, or a new writer to an existing one, and this check finds it with no edit here.
//
//   the QUARANTINE below is hand-maintained, and is a RATCHET rather than an expectation. It
//   records the writers already known dead when this check was written. It is checked in BOTH
//   directions: a new dead writer fails, and a quarantined writer that has since been wired also
//   fails, demanding the entry be removed. So the list can only shrink, and it cannot rot.
//
// The distinction matters: the check never asks "is this the set of writers I expect?" (which
// would be typed-against-typed and would certify whatever it was given). It asks "is anything
// dead that was not already known dead?", and the answer is computed from the tree every run.

import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../src');

/**
 * Writers known dead when this check was written, each with the ledger row that owns it.
 * REMOVE an entry when you wire it up — the test demands that, and fails if you leave it.
 * ADD an entry only with an owner-visible ledger row saying why the feature is not wired.
 */
const KNOWN_DEAD: ReadonlyMap<string, string> = new Map([
  // ledger N4. NOT the same case as N3, which was wired rather than quarantined, and the
  // difference is worth stating because both looked identical from here: a user-table write path
  // built ahead of a `ComingSoon` surface.
  //
  // `/library/books` was pure CRUD over a table that already existed, so "coming soon" was only
  // ever true for want of a caller — it was built (N3). `/chat/[id]` says in its own copy that
  // study partners "arrive with the trained model", so `chat_memories` is infrastructure for a
  // feature that CANNOT be built today. Deleting it under bylaw 3 would destroy work for a
  // capability the product publicly promises, to satisfy a check; quarantining it says the same
  // thing honestly and costs nothing.
  //
  // The test below still demands this entry be REMOVED the moment anything calls it, so this is a
  // record of a decision rather than a place to hide one.
  ['addChatMemory', 'ledger N4 — chat_memories backs /chat, a ComingSoon gated on the trained model'],
]);

/** Every .ts/.tsx file under web/src. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const p = path.join(dir, name);
    return statSync(p).isDirectory() ? walk(p) : /\.tsx?$/.test(p) ? [p] : [];
  });
}

/** Comments are not call sites. Stripping them is what separates "somebody wrote this name
 *  down" from "somebody calls it" — the first version of this check counted the explanatory
 *  comment in app/library/page.tsx as a caller of `saveReadingProgress` and reported the very
 *  defect it was written for as healthy. */
const stripComments = (s: string): string =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const SQL_WRITE = /\b(INSERT\s+INTO|UPDATE\s+\w|DELETE\s+FROM)\b/i;

interface Writer {
  name: string;
  file: string;
}

const files = walk(SRC).map((p) => ({ p, code: stripComments(readFileSync(p, 'utf8')) }));

/** The user-write layer, derived: a lib module that reaches user rows through runAsUser. */
const stores = files.filter((f) => f.p.includes(`${path.sep}lib${path.sep}`) && /\brunAsUser\b/.test(f.code));

/** Exported functions in those modules whose body carries a SQL write verb. */
function writersIn(file: { p: string; code: string }): Writer[] {
  const marks = [...file.code.matchAll(/^export (?:async )?function (\w+)/gm)];
  return marks
    .map((m, i) => ({
      name: m[1]!,
      body: file.code.slice(m.index!, marks[i + 1]?.index ?? file.code.length),
    }))
    .filter((w) => SQL_WRITE.test(w.body))
    .map((w) => ({ name: w.name, file: path.relative(SRC, file.p) }));
}

/** A call site: another module that imports the name AND invokes it, or an invocation
 *  elsewhere in its own module (a writer reached through a public wrapper beside it). */
function hasCallSite(w: Writer, declaredIn: { p: string; code: string }): boolean {
  const invoked = new RegExp(`\\b${w.name}\\s*\\(`);
  const imported = new RegExp(`import[^;]*\\b${w.name}\\b[^;]*from`, 's');

  const marks = [...declaredIn.code.matchAll(/^export (?:async )?function (\w+)/gm)];
  const self = marks.find((m) => m[1] === w.name)!;
  const next = marks[marks.indexOf(self) + 1];
  const outsideOwnBody =
    declaredIn.code.slice(0, self.index!) + declaredIn.code.slice(next?.index ?? declaredIn.code.length);
  if (invoked.test(outsideOwnBody)) return true;

  return files.some((f) => f.p !== declaredIn.p && imported.test(f.code) && invoked.test(f.code));
}

const allWriters = stores.flatMap((f) => writersIn(f).map((w) => ({ w, f })));
const dead = allWriters.filter(({ w, f }) => !hasCallSite(w, f)).map(({ w }) => w);

describe('no user-table writer is dead code', () => {
  // A guard that found nothing to guard would pass for the wrong reason — if the derivation
  // silently stopped matching (a rename of `runAsUser`, a change of export style), every
  // assertion below becomes vacuously true. This is the control.
  it('the derivation actually finds the user-write layer', () => {
    expect(stores.length, 'no lib module matched runAsUser — the derivation is broken').toBeGreaterThan(5);
    expect(allWriters.length, 'no SQL writers found — the derivation is broken').toBeGreaterThan(15);
    // The writer this check was born from must be among them, and must be alive.
    expect(allWriters.map(({ w }) => w.name)).toContain('saveReadingProgress');
  });

  it('every writer that reaches a user table has a caller', () => {
    const unexpected = dead.filter((w) => !KNOWN_DEAD.has(w.name));
    expect(
      unexpected.map((w) => `${w.name} (${w.file})`),
      'These write a user row and nothing calls them, so the feature they implement does not run. '
        + 'Wire them up, delete them (bylaw 3: deletion is an allowed remedy), or add them to '
        + 'KNOWN_DEAD with the ledger row that says why.',
    ).toEqual([]);
  });

  // The other direction, which is what stops the quarantine becoming a graveyard nobody revisits.
  it('the quarantine has no stale entries', () => {
    const deadNames = new Set(dead.map((w) => w.name));
    const declared = [...KNOWN_DEAD.keys()];
    const revived = declared.filter((name) => !deadNames.has(name));
    expect(
      revived,
      'These are listed as known-dead but now have callers. Remove them from KNOWN_DEAD — a '
        + 'quarantine list that outlives the problem is how a ratchet turns back into a rubber stamp.',
    ).toEqual([]);

    // And an entry naming a function that no longer exists is equally stale.
    const known = new Set(allWriters.map(({ w }) => w.name));
    expect(
      declared.filter((name) => !known.has(name)),
      'KNOWN_DEAD names a writer that is not in the tree any more.',
    ).toEqual([]);
  });

  it('saveReadingProgress specifically is wired — the defect this check was born from', () => {
    expect(dead.map((w) => w.name)).not.toContain('saveReadingProgress');
  });
});

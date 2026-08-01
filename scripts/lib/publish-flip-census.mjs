// Publish-flip preflight census — THE VERDICT LOGIC, with no database and no SQL in it.
//
// WHY IT IS SPLIT THIS WAY. The census runner (scripts/publish-flip-census.mts) has to
// import the serving predicates from web/src, so it can only run under tsx against a live
// database. If the STOP rules lived in there too, the only way to find out whether a
// not-admitted work actually stops the flip would be to seed one into a database and look
// — which is precisely the kind of check that gets written once, never watched fail, and
// then trusted. Everything here is a pure function of a measured census, so each STOP rule
// can be driven red on demand.
//
// The runner MEASURES. This file DECIDES. Nothing here re-implements a serving predicate:
// admission is decided by the runner using the imported LEGAL_CORPUS_FILTER /
// SERVED_PROSE_WORKS / SERVED_LANE_WORKS, and arrives here already computed.

/** A source as the runner measured it. `admitted` came from the imported predicates. */
export const STOP = 'STOP';
export const WARN = 'WARN';
export const OK = 'OK';

/**
 * §1 — admission. A work that is `published` in the database but NOT admitted by the
 * serving predicates is the flip's worst outcome: the library lists it, the reader links
 * to it, and every retrieval path drops it. The visitor sees a work that answers nothing.
 */
export function admissionFindings(sources) {
  return sources.map((s) => ({
    slug: s.slug,
    status: s.status,
    register: s.register ?? s.source_type ?? '(none)',
    admitted: s.admitted === true,
    verdict: s.status === 'published' && s.admitted !== true ? STOP : OK,
    note:
      s.status === 'published' && s.admitted !== true
        ? 'PUBLISHED BUT NOT ADMITTED — served by nothing; the reader would link to a work retrieval cannot return'
        : s.admitted === true
          ? 'admitted by the serving predicates'
          : 'not admitted, and not published — consistent',
  }));
}

/**
 * §2 — forbidden provenance. Two different numbers, deliberately not summed: what EXISTS
 * in the cohort, and what becomes REACHABLE once the flip lands. A row on a staged work is
 * debt; the same row on a published work is exposure.
 */
export function forbiddenExposure(rows) {
  const exposed = rows.filter((r) => r.count > 0);
  const reachable = exposed.filter((r) => r.willBePublished);
  return {
    works: exposed,
    totalRows: exposed.reduce((n, r) => n + r.count, 0),
    reachableWorks: reachable,
    reachableRows: reachable.reduce((n, r) => n + r.count, 0),
    verdict: reachable.length > 0 ? WARN : OK,
    note:
      reachable.length > 0
        ? `${reachable.length} work(s) carrying forbidden-provenance rows become READER-REACHABLE at the flip`
        : 'no forbidden-provenance row becomes reachable at the flip',
  };
}

/**
 * §3 — voice floor. Reported at BOTH thresholds because they answer different questions:
 * 0 distinct served authors means the verse has no attributable commentary at all, 1 means
 * it has exactly one and the product's ">=2 voices" guarantee does not hold there.
 */
export function voiceFloorFindings({ versesWithZero, versesWithOne, versesMeasured }) {
  if (!Number.isInteger(versesMeasured) || versesMeasured <= 0) {
    return {
      versesMeasured: versesMeasured ?? 0,
      versesWithZero: versesWithZero ?? 0,
      versesWithOne: versesWithOne ?? 0,
      verdict: STOP,
      note: 'voice floor measured over ZERO verses — the measurement is blind, not clean',
    };
  }
  return {
    versesMeasured,
    versesWithZero,
    versesWithOne,
    verdict: OK,
    note: `${versesWithZero} verse(s) with 0 distinct served authors, ${versesWithOne} with exactly 1, of ${versesMeasured} measured`,
  };
}

/**
 * §4 — what actually serves. A literal zero anywhere here is a STOP, not a row in a table:
 * a census that reports "0 published works" or "0 catalog entries" and exits green is the
 * unearned green THE_LOOP §6 names. If the flip would leave a serving surface empty, the
 * census must refuse before the flip, not describe it afterwards.
 */
export function servingFindings({ worksByRegister, entriesByCatalog }) {
  const registers = Object.entries(worksByRegister ?? {});
  const catalogs = Object.entries(entriesByCatalog ?? {});
  const emptyRegisters = registers.filter(([, n]) => !n);
  const emptyCatalogs = catalogs.filter(([, n]) => !n);
  const totalWorks = registers.reduce((n, [, v]) => n + v, 0);
  const totalEntries = catalogs.reduce((n, [, v]) => n + v, 0);

  const zeroReasons = [];
  if (registers.length === 0) zeroReasons.push('no registers reported at all');
  if (catalogs.length === 0) zeroReasons.push('no catalogs reported at all');
  if (totalWorks === 0) zeroReasons.push('ZERO published works across every register');
  if (totalEntries === 0) zeroReasons.push('ZERO entries across every catalog');
  for (const [r] of emptyRegisters) zeroReasons.push(`register '${r}' would serve 0 works`);
  for (const [c] of emptyCatalogs) zeroReasons.push(`catalog '${c}' would serve 0 entries`);

  return {
    worksByRegister: worksByRegister ?? {},
    entriesByCatalog: entriesByCatalog ?? {},
    totalWorks,
    totalEntries,
    verdict: zeroReasons.length > 0 ? STOP : OK,
    note: zeroReasons.length > 0 ? `serving literal count zero: ${zeroReasons.join('; ')}` : `${totalWorks} work(s) across ${registers.length} register(s), ${totalEntries} entry/entries across ${catalogs.length} catalog(s)`,
  };
}

/**
 * Roll the four sections into one exit decision.
 *
 * STOP is contagious and is NEVER downgraded by a later green section — the point of a
 * preflight is that one refusal is enough.
 */
export function censusVerdict({ admission, forbidden, voices, serving }) {
  const stops = [];
  for (const a of admission ?? []) {
    if (a.verdict === STOP) stops.push(`§1 ${a.slug}: ${a.note}`);
  }
  if (voices?.verdict === STOP) stops.push(`§3 ${voices.note}`);
  if (serving?.verdict === STOP) stops.push(`§4 ${serving.note}`);
  // §2 is deliberately a WARN, not a STOP: forbidden-provenance exposure is governed by
  // the ratchet (predeploy-gate) and by ADR-008, and this census's job is to make it
  // VISIBLE at flip time, not to become a second, differently-calibrated legal gate.
  const warnings = forbidden?.verdict === WARN ? [`§2 ${forbidden.note}`] : [];
  return { stop: stops.length > 0, stops, warnings, exitCode: stops.length > 0 ? 1 : 0 };
}

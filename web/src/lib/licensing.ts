// THE LICENSE RECORD — the single source of truth the deploy gate reads to decide whether a
// CORPUS work (user_id IS NULL: a Bible translation under web/public/bible/, or a served
// commentary author) may ship. This is the record the three legacy mechanisms never had:
//   - predeploy-gate's translation *denylist* (a blocklist, no license basis)
//   - the forbidden-*provenance* ratchet (source domain, not license)
//   - isPublishedCommentaryEntry (an author *allowlist*, no license)
// Now the gate reads THIS: block-by-default, ship only on a record that permits it.
//
// commercial_use is the gate axis: `allow` ships; `conditional` ships only when the owner has
// acknowledged it (LICENSE_ACK env, comma-separated work ids); `deny`, `unknown`, and *no
// record at all* block. UGC (user_id IS NOT NULL) is out of scope by construction — the gate
// never reads a user table or blob (see docs/PHASE_A_CLOSE.md §4).

export type CommercialUse = 'allow' | 'deny' | 'conditional';

export interface LicenseRecord {
  license: string; // 'Public Domain' | 'CC BY-SA' | 'copyright' | 'unknown'
  commercial_use: CommercialUse;
  source: string; // where the fact was verified
  verified_on: string; // ISO date, or '—' if unknown
  attribution?: string; // required display credit (CC BY / CC BY-SA)
}

// Bible translations under web/public/bible/<id>/. verified_on = the LONG_NIGHT license pass.
// Owner rulings (2026-07-14): LITV/MKJV deny, LSV allow (CC BY-SA), LEB conditional.
export const TRANSLATION_LICENSES: Record<string, LicenseRecord> = {
  // Clear public domain — pre-1929 editions or explicit PD dedications.
  web: { license: 'Public Domain', commercial_use: 'allow', source: 'eBible.org — public domain dedication', verified_on: '2026-07-14' },
  bsb: { license: 'Public Domain', commercial_use: 'allow', source: 'berean.bible — public domain dedication', verified_on: '2026-07-14' },
  kjv: { license: 'Public Domain', commercial_use: 'allow', source: 'KJV 1611/1769 — PD (US)', verified_on: '2026-07-14' },
  asv: { license: 'Public Domain', commercial_use: 'allow', source: 'ASV 1901 — PD', verified_on: '2026-07-14' },
  ylt: { license: 'Public Domain', commercial_use: 'allow', source: "Young's Literal 1898 — PD", verified_on: '2026-07-14' },
  darby: { license: 'Public Domain', commercial_use: 'allow', source: 'Darby 1890 — PD', verified_on: '2026-07-14' },
  bbe: { license: 'Public Domain', commercial_use: 'allow', source: 'SWORD module DistributionLicense: Public Domain', verified_on: '2026-07-14' },
  geneva: { license: 'Public Domain', commercial_use: 'allow', source: 'Geneva 1599 — PD', verified_on: '2026-07-14' },
  tyndale: { license: 'Public Domain', commercial_use: 'allow', source: 'Tyndale NT 1526 — PD (the translation, NOT the copyrighted Tyndale Study Notes)', verified_on: '2026-07-14' },
  webster: { license: 'Public Domain', commercial_use: 'allow', source: "Webster's 1833 — PD", verified_on: '2026-07-14' },
  nheb: { license: 'Public Domain', commercial_use: 'allow', source: 'New Heart English Bible — released to PD', verified_on: '2026-07-14' },
  akjv: { license: 'Public Domain', commercial_use: 'allow', source: 'American KJV — PD update of the KJV', verified_on: '2026-07-14' },
  rotherham: { license: 'Public Domain', commercial_use: 'allow', source: 'Rotherham Emphasized 1902 — PD', verified_on: '2026-07-14' },
  rwebster: { license: 'Public Domain', commercial_use: 'allow', source: 'Revised Webster — PD update', verified_on: '2026-07-14' },
  ukjv: { license: 'Public Domain', commercial_use: 'allow', source: 'Updated KJV — PD update', verified_on: '2026-07-14' },
  noyes: { license: 'Public Domain', commercial_use: 'allow', source: 'Noyes 1869 — PD', verified_on: '2026-07-14' },
  anderson: { license: 'Public Domain', commercial_use: 'allow', source: 'Anderson NT 1864 — PD', verified_on: '2026-07-14' },

  // Permissively licensed — ships WITH attribution (owner ruling 2026-07-14).
  lsv: {
    license: 'CC BY-SA',
    commercial_use: 'allow',
    source: 'Literal Standard Version — CC BY-SA 4.0 (Covenant Press); owner ruling 2026-07-14',
    verified_on: '2026-07-14',
    attribution: 'Scripture quotations are from the Literal Standard Version (LSV), © Covenant Press, licensed CC BY-SA 4.0.',
  },

  // Conditional — copyrighted-but-permitted-with-acknowledgment. Blocked until the owner adds
  // its id to LICENSE_ACK. Not a Phase A blocker (a Bible translation, not retrieval).
  leb: {
    license: 'copyright (permissive with attribution + ack)',
    commercial_use: 'conditional',
    source: 'Lexham English Bible — Logos/Lexham Press permissive terms require acknowledgment; owner ruling 2026-07-14',
    verified_on: '2026-07-14',
    attribution: 'The Lexham English Bible. Copyright 2012 Logos Bible Software. Lexham is a registered trademark of Logos Bible Software.',
  },

  // Denied — copyrighted, no permission (owner ruling 2026-07-14). Files must be removed.
  litv: { license: 'copyright', commercial_use: 'deny', source: "Green's Literal Translation — © copyright; owner ruling 2026-07-14", verified_on: '2026-07-14' },
  mkjv: { license: 'copyright', commercial_use: 'deny', source: "Modern KJV (Green's) — © copyright; owner ruling 2026-07-14", verified_on: '2026-07-14' },

  // Unknown — could not verify a PD/permissive basis; the 2000 edition appears copyrighted
  // (Russell Stendal / Life Sentence Publishing). Blocks by default until verified.
  jubilee: { license: 'unknown', commercial_use: 'deny', source: 'Jubilee Bible 2000 — copyright status unverified, appears © Life Sentence Publishing; NEEDS OWNER VERIFICATION', verified_on: '—' },
};

// Served commentary authors (user_id IS NULL). All pre-1929 / public domain. Keyed by the
// author name used in the corpus (both Barnes aliases recorded). The commentary gate today is
// the provenance ratchet + author allowlist; these records document the license BASIS so
// every served corpus work has one, per T1§2.
export const COMMENTARY_LICENSES: Record<string, LicenseRecord> = {
  'John Gill': { license: 'Public Domain', commercial_use: 'allow', source: "Gill's Exposition 1746-63 — PD", verified_on: '2026-07-14' },
  'Jamieson, Fausset & Brown': { license: 'Public Domain', commercial_use: 'allow', source: 'JFB Commentary 1871 — PD', verified_on: '2026-07-14' },
  'Adam Clarke': { license: 'Public Domain', commercial_use: 'allow', source: "Clarke's Commentary 1831 — PD", verified_on: '2026-07-14' },
  'Matthew Henry': { license: 'Public Domain', commercial_use: 'allow', source: 'Henry Complete Commentary 1710 — PD', verified_on: '2026-07-14' },
  'Albert Barnes': { license: 'Public Domain', commercial_use: 'allow', source: "Barnes' Notes 1834 — PD (crosswire edition)", verified_on: '2026-07-14' },
  "Barnes' Notes": { license: 'Public Domain', commercial_use: 'allow', source: "Barnes' Notes 1834 — PD (commentary_entries alias)", verified_on: '2026-07-14' },
  'John Wesley': { license: 'Public Domain', commercial_use: 'allow', source: 'Wesley Explanatory Notes 1755 — PD (crosswire)', verified_on: '2026-07-14' },
  'John Calvin': { license: 'Public Domain', commercial_use: 'allow', source: 'Calvin Commentaries 1540-63 — PD (crosswire)', verified_on: '2026-07-14' },
  'Augustine of Hippo': { license: 'Public Domain', commercial_use: 'allow', source: 'NPNF (Schaff) — PD; provenance repair to New Advent pending', verified_on: '2026-07-14' },
  'John Chrysostom': { license: 'Public Domain', commercial_use: 'allow', source: 'NPNF (Schaff) — PD; provenance repair to New Advent pending', verified_on: '2026-07-14' },
};

// Devotional works served on the daily "Today" home screen (web/public/devotional/*).
// Not a Bible translation and not a served commentary author — its own provenance record so
// every shipped work has one (T1§2). Spurgeon's text + the KJV it quotes are both public domain.
export interface DevotionalLicenseRecord extends LicenseRecord {
  work: string;
  author: string;
  pd_basis: string;
  verse_translation: string;
}
export const DEVOTIONAL_LICENSES: Record<string, DevotionalLicenseRecord> = {
  'morning-evening': {
    work: 'Morning and Evening',
    author: 'C. H. Spurgeon (d.1892)',
    license: 'Public Domain',
    commercial_use: 'allow',
    pd_basis: 'pre-1929 (author died 1892)',
    source: 'archive.spurgeon.org/morn_eve — re-provenanced from the Spurgeon Center PD archive, NOT CCEL markup',
    verse_translation: 'KJV (Public Domain)',
    verified_on: '2026-07-16',
  },
};

const NO_RECORD: LicenseRecord = { license: 'unknown', commercial_use: 'deny', source: 'no license record', verified_on: '—' };

/** Work ids the owner has acknowledged for conditional shipping (LICENSE_ACK=leb,...). */
export function acknowledgedWorkIds(env: string | undefined = process.env.LICENSE_ACK): Set<string> {
  return new Set((env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean));
}

export interface ShipDecision {
  ship: boolean;
  reason: string;
  record: LicenseRecord;
}

// THE gate decision for one corpus work. Ships iff commercial_use === 'allow', or
// 'conditional' AND the id is acknowledged. deny / unknown / no-record all block.
export function shipDecision(
  workId: string,
  record: LicenseRecord | undefined,
  ack: Set<string> = acknowledgedWorkIds(),
): ShipDecision {
  const rec = record ?? NO_RECORD;
  if (rec.commercial_use === 'allow') return { ship: true, reason: `${rec.license} (allow)`, record: rec };
  if (rec.commercial_use === 'conditional') {
    return ack.has(workId.toLowerCase())
      ? { ship: true, reason: `${rec.license} (conditional, acknowledged)`, record: rec }
      : { ship: false, reason: `${rec.license} (conditional) — not acknowledged; add "${workId}" to LICENSE_ACK`, record: rec };
  }
  return { ship: false, reason: rec === NO_RECORD ? 'no license record (block-by-default)' : `${rec.license} (${rec.commercial_use})`, record: rec };
}

/** Ship decision for a Bible translation directory id. */
export function translationShipDecision(id: string, ack?: Set<string>): ShipDecision {
  return shipDecision(id, TRANSLATION_LICENSES[id], ack);
}

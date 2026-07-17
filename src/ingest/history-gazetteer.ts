// Hand-seeded entity gazetteer for historian ingest (HISTORY_RETRIEVAL_DESIGN
// §3/§4, open question (b) resolved conservatively: hand-seeded, like
// pericopes.ts). The KIND is human-curated fact; the ingest gate writes an
// anchor ONLY where the label appears VERBATIM in the section's heading or body
// (§2.3 — facts lifted from the source, never app judgments). Missing entries
// mean sparser anchors, never wrong ones. Extend by hand, review in PR.

export type EntityKind = 'person' | 'place' | 'event' | 'institution';

export interface GazetteerEntry {
  slug: string;
  label: string; // the verbatim surface form searched for
  kind: EntityKind;
  aliases?: string[]; // additional verbatim surface forms
}

export const HISTORY_GAZETTEER: GazetteerEntry[] = [
  // — Second-Temple / Josephus era —
  { slug: 'herod-the-great', label: 'Herod', kind: 'person' },
  { slug: 'vespasian', label: 'Vespasian', kind: 'person' },
  { slug: 'titus', label: 'Titus', kind: 'person' },
  { slug: 'nero', label: 'Nero', kind: 'person' },
  { slug: 'pilate', label: 'Pilate', kind: 'person' },
  { slug: 'moses', label: 'Moses', kind: 'person' },
  { slug: 'abraham', label: 'Abraham', kind: 'person' },
  { slug: 'david', label: 'David', kind: 'person' },
  { slug: 'solomon', label: 'Solomon', kind: 'person' },
  { slug: 'antony', label: 'Antony', kind: 'person' },
  { slug: 'caesar', label: 'Caesar', kind: 'person' },
  { slug: 'agrippa', label: 'Agrippa', kind: 'person' },
  { slug: 'jerusalem', label: 'Jerusalem', kind: 'place' },
  { slug: 'galilee', label: 'Galilee', kind: 'place' },
  { slug: 'judea', label: 'Judea', kind: 'place', aliases: ['Judaea'] },
  { slug: 'rome', label: 'Rome', kind: 'place' },
  { slug: 'egypt', label: 'Egypt', kind: 'place' },
  { slug: 'babylon', label: 'Babylon', kind: 'place' },
  { slug: 'masada', label: 'Masada', kind: 'place' },
  { slug: 'samaria', label: 'Samaria', kind: 'place' },
  { slug: 'antioch', label: 'Antioch', kind: 'place' },
  { slug: 'alexandria', label: 'Alexandria', kind: 'place' },
  { slug: 'the-temple', label: 'the temple', kind: 'institution', aliases: ['the Temple'] },
  { slug: 'sanhedrin', label: 'Sanhedrin', kind: 'institution' },
  { slug: 'pharisees', label: 'Pharisees', kind: 'institution' },
  { slug: 'sadducees', label: 'Sadducees', kind: 'institution' },
  { slug: 'essenes', label: 'Essenes', kind: 'institution' },
  { slug: 'siege-of-jerusalem', label: 'siege of Jerusalem', kind: 'event' },
  // — early-church era (Eusebius/Schaff, when their clean source lands) —
  { slug: 'constantine', label: 'Constantine', kind: 'person' },
  { slug: 'athanasius', label: 'Athanasius', kind: 'person' },
  { slug: 'arius', label: 'Arius', kind: 'person' },
  { slug: 'origen', label: 'Origen', kind: 'person' },
  { slug: 'polycarp', label: 'Polycarp', kind: 'person' },
  { slug: 'ignatius-of-antioch', label: 'Ignatius', kind: 'person' },
  { slug: 'diocletian', label: 'Diocletian', kind: 'person' },
  { slug: 'nicaea', label: 'Nicaea', kind: 'place', aliases: ['Nice'] },
  { slug: 'council-of-nicaea', label: 'Council of Nicaea', kind: 'event', aliases: ['Council of Nice'] },
  { slug: 'diocletian-persecution', label: 'Diocletian persecution', kind: 'event' },
];

/** Anchors for one section: gazetteer entries whose label (or alias) appears
 *  VERBATIM AS A WORD in heading or body. Word boundaries are load-bearing:
 *  plain substring matching anchored "Caesar" to every "Caesarea" and Nicaea's
 *  "Nice" alias to "Nicelens"/"Nicephorus" (deep-audit 2026-07-16, M3). */
const wordRe = new Map<string, RegExp>();
function hasWord(hay: string, s: string): boolean {
  let re = wordRe.get(s);
  if (!re) {
    re = new RegExp(`\\b${s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
    wordRe.set(s, re);
  }
  return re.test(hay);
}
export function verbatimAnchors(heading: string, body: string): GazetteerEntry[] {
  const hay = `${heading}\n${body}`;
  return HISTORY_GAZETTEER.filter((g) =>
    [g.label, ...(g.aliases ?? [])].some((s) => hasWord(hay, s)),
  );
}

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
  // — Curated 2026-08-20 from Phase-1 digest candidates + the Phase-2 corpus eras (historian
  //   plan §Phase 1 gate 3). DERIVED candidates, HUMAN-adopted, verbatim-gated at ingest as ever.
  //   DELIBERATELY SKIPPED as ambiguous bare labels: "Augustine" (Canterbury vs Hippo — a bare
  //   label would anchor both men indistinguishably), "Gregory" (the Great vs Nazianzen vs
  //   Nyssa), "Constantine" is already present and unambiguous in practice. Disambiguation
  //   needs alias-with-context support before those are adoptable.
  // Bede / early Britain —
  { slug: 'britain', label: 'Britain', kind: 'place' },
  { slug: 'saxons', label: 'Saxons', kind: 'person' },
  { slug: 'britons', label: 'Britons', kind: 'person' },
  { slug: 'picts', label: 'Picts', kind: 'person' },
  { slug: 'kent', label: 'Kent', kind: 'place' },
  { slug: 'canterbury', label: 'Canterbury', kind: 'place' },
  { slug: 'northumbria', label: 'Northumbria', kind: 'place' },
  { slug: 'mercia', label: 'Mercia', kind: 'place' },
  { slug: 'iona', label: 'Iona', kind: 'place' },
  { slug: 'lindisfarne', label: 'Lindisfarne', kind: 'place' },
  { slug: 'wilfrid', label: 'Wilfrid', kind: 'person' },
  { slug: 'cuthbert', label: 'Cuthbert', kind: 'person' },
  { slug: 'columba', label: 'Columba', kind: 'person' },
  { slug: 'easter-controversy', label: 'Easter', kind: 'event' },
  // — patristic / conciliar (Schaff HCC I–III) —
  { slug: 'constantinople', label: 'Constantinople', kind: 'place' },
  { slug: 'chalcedon', label: 'Chalcedon', kind: 'place' },
  { slug: 'chrysostom', label: 'Chrysostom', kind: 'person' },
  { slug: 'jerome-of-stridon', label: 'Jerome', kind: 'person' },
  { slug: 'ambrose', label: 'Ambrose', kind: 'person' },
  { slug: 'donatists', label: 'Donatists', kind: 'institution' },
  { slug: 'arians', label: 'Arians', kind: 'institution' },
  // — medieval / reformation (HCC IV–VIII, Foxe, van Braght, Baird) —
  { slug: 'charlemagne', label: 'Charlemagne', kind: 'person' },
  { slug: 'crusades', label: 'Crusade', kind: 'event', aliases: ['Crusades'] },
  { slug: 'wycliffe', label: 'Wycliffe', kind: 'person', aliases: ['Wiclif'] },
  { slug: 'huss', label: 'Huss', kind: 'person' },
  { slug: 'luther', label: 'Luther', kind: 'person' },
  { slug: 'melanchthon', label: 'Melanchthon', kind: 'person' },
  { slug: 'zwingli', label: 'Zwingli', kind: 'person' },
  { slug: 'calvin-john', label: 'Calvin', kind: 'person' },
  { slug: 'geneva', label: 'Geneva', kind: 'place' },
  { slug: 'wittenberg', label: 'Wittenberg', kind: 'place' },
  { slug: 'worms', label: 'Worms', kind: 'place' },
  { slug: 'huguenots', label: 'Huguenots', kind: 'person' },
  { slug: 'waldenses', label: 'Waldenses', kind: 'person', aliases: ['Waldensians'] },
  { slug: 'anabaptists', label: 'Anabaptists', kind: 'person' },
  { slug: 'cranmer', label: 'Cranmer', kind: 'person' },
  { slug: 'latimer', label: 'Latimer', kind: 'person' },
  { slug: 'ridley', label: 'Ridley', kind: 'person' },
  // — American / Methodist era (Bangs, Bacon) —
  { slug: 'wesley-john', label: 'Wesley', kind: 'person' },
  { slug: 'whitefield', label: 'Whitefield', kind: 'person' },
  { slug: 'asbury', label: 'Asbury', kind: 'person' },
  { slug: 'methodists', label: 'Methodists', kind: 'institution' },
  { slug: 'puritans', label: 'Puritans', kind: 'person' },

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

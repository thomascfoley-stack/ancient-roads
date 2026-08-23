// ADR-118 proper-noun held-out set — n=20 FRESH cases (W-PN20, 2026-08-22).
//
// Minted under the pre-registration at docs/evidence/swarm-2026-08-22/w-pn20/PRE-REG.md,
// committed BEFORE any measurement. The bar being measured (ADR-118, amended 2026-08-22):
// HIT@2 >= 90% point estimate at n=20, i.e. >= 18/20. The result is REPORTED, never tuned.
//
// FRESHNESS (ADR-118 §3): every case is a proper noun ABSENT from the pilot, v2 (frozen),
// v3 and v4 proper-noun strata (v4's ten are burned — named one by one in PRE-REG.md), and
// every label chapter is disjoint from every prior set's `expected` labels. Disjointness is
// checked mechanically by heldout-anchor-check.mts, which also verifies each `source` anchor
// phrase against the in-repo KJV (web/public/bible/kjv) — the reproducibility gap recorded in
// STATE_OF_TRUTH §1 caveat 4.
//
// LABELING — the v4 discipline, unchanged: every label is derived from the query's own
// scripture (the entity named + its defining episode), NEVER from retrieval output. The
// `source` field cites a KJV anchor (chapter:verse + quoted phrase); the anchor phrase occurs
// in EVERY labeled chapter. There is NO relabel path: a correction is a new file + new pin.

import type { Q } from './heldout-queries.mjs';

export const FROZEN_PN20: Q[] = [
  // ── Old Testament (12) ──
  { id: 'pn20-01', cat: 'proper-noun', query: 'Abimelech king of Gerar who took Sarah', expected: ['Genesis 20'], source: 'KJV Gen 20:2 "Abimelech king of Gerar sent, and took Sarah"' },
  { id: 'pn20-02', cat: 'proper-noun', query: 'Korah and the rebellion that the earth swallowed up', expected: ['Numbers 16'], source: 'KJV Num 16:32 "the earth opened her mouth, and swallowed them up"' },
  { id: 'pn20-03', cat: 'proper-noun', query: 'Ehud the lefthanded man who slew Eglon king of Moab', expected: ['Judges 3'], source: 'KJV Judg 3:15 "Ehud" · Judg 3:15 "lefthanded"' },
  { id: 'pn20-04', cat: 'proper-noun', query: 'Gideon and the fleece of wool, wet and dry', expected: ['Judges 6'], source: 'KJV Judg 6:37 "fleece of wool"' },
  { id: 'pn20-05', cat: 'proper-noun', query: 'Abigail who interceded with David for Nabal her husband', expected: ['1 Samuel 25'], source: 'KJV 1 Sam 25:3 "Abigail"' },
  { id: 'pn20-06', cat: 'proper-noun', query: 'Micaiah the prophet who saw the LORD sitting on his throne', expected: ['1 Kings 22'], source: 'KJV 1 Kgs 22:19 "I saw the LORD sitting on his throne"' },
  { id: 'pn20-07', cat: 'proper-noun', query: 'Absalom caught by his head in the oak as his mule went on', expected: ['2 Samuel 18'], source: 'KJV 2 Sam 18:9 "his head caught hold of the oak"' },
  { id: 'pn20-08', cat: 'proper-noun', query: 'Adonijah who exalted himself saying I will be king', expected: ['1 Kings 1'], source: 'KJV 1 Kgs 1:5 "Adonijah" · 1 Kgs 1:5 "exalted himself, saying, I will be king"' },
  { id: 'pn20-09', cat: 'proper-noun', query: 'Jehu who drove furiously and cut off the house of Ahab', expected: ['2 Kings 9', '2 Kings 10'], source: 'KJV 2 Kgs 9:20 "he driveth furiously" · 2 Kgs 10:11 "Jehu slew all that remained of the house of Ahab"' },
  { id: 'pn20-10', cat: 'proper-noun', query: 'Uzziah the king who burned incense and was smitten with leprosy', expected: ['2 Chronicles 26'], source: 'KJV 2 Chr 26:19 "leprosy even rose up in his forehead"' },
  { id: 'pn20-11', cat: 'proper-noun', query: 'Mordecai who would not bow to Haman', expected: ['Esther 3'], source: 'KJV Esth 3:2 "Mordecai bowed not, nor did him reverence"' },
  { id: 'pn20-12', cat: 'proper-noun', query: 'Gomer, the wife of Hosea the prophet', expected: ['Hosea 1'], source: 'KJV Hos 1:3 "Gomer the daughter of Diblaim"' },

  // ── New Testament (8) ──
  { id: 'pn20-13', cat: 'proper-noun', query: 'Joseph of Arimathaea who begged the body of Jesus', expected: ['Luke 23'], source: 'KJV Luke 23:50 "a man named Joseph" · Luke 23:52 "begged the body of Jesus"' },
  { id: 'pn20-14', cat: 'proper-noun', query: 'Malchus the high priest’s servant whose ear Peter cut off', expected: ['John 18'], source: 'KJV John 18:10 "The servant’s name was Malchus"' },
  { id: 'pn20-15', cat: 'proper-noun', query: 'Pilate who washed his hands before the multitude', expected: ['Matthew 27'], source: 'KJV Matt 27:24 "he took water, and washed his hands before the multitude"' },
  { id: 'pn20-16', cat: 'proper-noun', query: 'Stephanas and his household, the firstfruits of Achaia', expected: ['1 Corinthians 16'], source: 'KJV 1 Cor 16:15 "house of Stephanas, that it is the firstfruits of Achaia"' },
  { id: 'pn20-17', cat: 'proper-noun', query: 'Jezebel of Thyatira who calls herself a prophetess', expected: ['Revelation 2'], source: 'KJV Rev 2:20 "that woman Jezebel, which calleth herself a prophetess"' },
  { id: 'pn20-18', cat: 'proper-noun', query: 'Diotrephes who loveth to have the preeminence', expected: ['3 John 1'], source: 'KJV 3 John 1:9 "Diotrephes, who loveth to have the preeminence"' },
  { id: 'pn20-19', cat: 'proper-noun', query: 'Felix the governor who trembled as Paul reasoned of righteousness', expected: ['Acts 24'], source: 'KJV Acts 24:25 "Felix trembled, and answered"' },
  { id: 'pn20-20', cat: 'proper-noun', query: 'Hymenaeus and Alexander whom Paul delivered unto Satan', expected: ['1 Timothy 1'], source: 'KJV 1 Tim 1:20 "Hymenaeus and Alexander; whom I have delivered unto Satan"' },
];

// Named-pericope gazetteer + query intent resolution (retrieval routing).
//
// Maps a named passage ("Sermon on the Mount", "the armor of God") to its
// scripture location(s). References only — a location index, never a claim about
// meaning (concordance guarantee). Locations are given as parseable reference
// strings and resolved through parseRef, so we never hand-encode verse IDs and
// the ranges stay canonical. Grows reactively as measured misses reveal gaps —
// a data change, not a code change.

import { parseRef, scanReferences, type VerseRange } from './ref-parse';

interface Pericope { aliases: string[]; refs: string[] }

// Aliases are lowercase, apostrophe-stripped, matched as whole phrases (§ below).
const PERICOPES: Pericope[] = [
  { aliases: ['sermon on the mount'], refs: ['Matthew 5-7'] },
  { aliases: ['the beatitudes', 'beatitudes'], refs: ['Matthew 5:3-12', 'Luke 6:20-23'] },
  { aliases: ['lords prayer', 'our father who art in heaven'], refs: ['Matthew 6:9-13', 'Luke 11:2-4'] },
  { aliases: ['armor of god', 'armour of god', 'whole armor of god'], refs: ['Ephesians 6:10-18'] },
  { aliases: ['ten commandments', 'decalogue'], refs: ['Exodus 20:1-17', 'Deuteronomy 5:6-21'] },
  { aliases: ['good shepherd'], refs: ['John 10'] },
  { aliases: ['the vine and the branches', 'vine and the branches'], refs: ['John 15'] },
  { aliases: ['bread of life'], refs: ['John 6'] },
  { aliases: ['prodigal son'], refs: ['Luke 15:11-32'] },
  { aliases: ['good samaritan'], refs: ['Luke 10:25-37'] },
  { aliases: ['road to emmaus'], refs: ['Luke 24:13-35'] },
  { aliases: ['the transfiguration', 'transfiguration'], refs: ['Matthew 17:1-9', 'Mark 9:2-8', 'Luke 9:28-36'] },
  { aliases: ['great commission'], refs: ['Matthew 28:16-20'] },
  { aliases: ['the lords supper', 'lords supper', 'last supper'], refs: ['Matthew 26:26-29', 'Luke 22:14-20', '1 Corinthians 11:23-26'] },
  { aliases: ['fruit of the spirit'], refs: ['Galatians 5:22-23'] },
  { aliases: ['the love chapter', 'love chapter'], refs: ['1 Corinthians 13'] },
  { aliases: ['the ten virgins', 'wise and foolish virgins'], refs: ['Matthew 25:1-13'] },
  { aliases: ['valley of dry bones'], refs: ['Ezekiel 37'] },
  { aliases: ['the burning bush', 'burning bush'], refs: ['Exodus 3'] },
  { aliases: ['golden calf'], refs: ['Exodus 32'] },
  { aliases: ['the fiery furnace', 'fiery furnace'], refs: ['Daniel 3'] },
  { aliases: ['lions den'], refs: ['Daniel 6'] },
  { aliases: ['writing on the wall', 'mene mene tekel'], refs: ['Daniel 5'] },
  { aliases: ['four horsemen'], refs: ['Revelation 6'] },
  { aliases: ['new heaven and a new earth', 'new heaven and new earth'], refs: ['Revelation 21'] },
  { aliases: ['pentecost', 'tongues of fire'], refs: ['Acts 2'] },
  { aliases: ['raising of lazarus', 'lazarus'], refs: ['John 11'] },
  { aliases: ['prophets of baal', 'mount carmel'], refs: ['1 Kings 18'] },
  { aliases: ['walking on water', 'walking on the water'], refs: ['Matthew 14:22-33', 'John 6:16-21'] },
  { aliases: ['feeding of the five thousand', 'feeding the five thousand'], refs: ['Matthew 14:13-21', 'John 6:1-14'] },
  { aliases: ['jacob wrestling', 'wrestling with god'], refs: ['Genesis 32'] },
  { aliases: ['the crucifixion', 'crucifixion of jesus'], refs: ['Matthew 27', 'John 19'] },
  { aliases: ['the empty tomb', 'resurrection of jesus'], refs: ['Matthew 28', 'John 20'] },
];

// Resolve reference strings ("Matthew 5-7") to canonical ranges via parseRef.
function resolveRefStrings(refs: string[]): VerseRange[] {
  const out: VerseRange[] = [];
  for (const s of refs) { const o = parseRef(s); if (o.ok) out.push(...o.ref.ranges); }
  return out;
}

// Named pericopes present in the text (whole-phrase match, punctuation-folded).
export function matchPericopes(text: string): VerseRange[] {
  const t = ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;
  const out: VerseRange[] = [];
  for (const p of PERICOPES) {
    if (p.aliases.some((a) => t.includes(` ${a} `))) out.push(...resolveRefStrings(p.refs));
  }
  return out;
}

// The retrieval intent: every passage this query names, as canonical verse-ID
// ranges (numeric refs + named pericopes), de-duplicated. Empty ⇒ topical ⇒
// current semantic retrieval unchanged.
export function resolveIntent(query: string): VerseRange[] {
  const ranges: VerseRange[] = [];
  for (const r of scanReferences(query)) ranges.push(...r.ranges);
  ranges.push(...matchPericopes(query));
  const seen = new Set<string>();
  return ranges.filter((r) => { const k = `${r.start}-${r.end}`; if (seen.has(k)) return false; seen.add(k); return true; });
}

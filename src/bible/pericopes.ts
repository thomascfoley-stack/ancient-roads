// Named-pericope gazetteer + query intent resolution (retrieval routing).
//
// Maps a named passage ("Sermon on the Mount", "the armor of God") to its
// scripture location(s). References only — a location index, never a claim about
// meaning (concordance guarantee). Locations are given as parseable reference
// strings and resolved through parseRef, so we never hand-encode verse IDs and
// the ranges stay canonical. Grows reactively as measured misses reveal gaps —
// a data change, not a code change.
//
// resolveIntent returns TWO tiers (measured precision, not assumed — see the
// false-positive probe, `probe-reference-routing.mts`):
//   - inject: every range the query plausibly names. Soft-boost only — adding
//     these to the reranker pool is false-positive-safe (the reranker still
//     decides), so an idiomatic "bread of life bakery" costs nothing.
//   - floor: the HIGH-CONFIDENCE subset that earns the reserved top slots. A
//     numeric reference ("1 Corinthians 13") is unambiguous intent and always
//     floors. A pericope NAME is idiom-prone ("good shepherd insurance"), so it
//     floors only with biblical corroboration — a second named passage, or a
//     scriptural token OUTSIDE the matched phrase. Un-corroborated pericopes
//     inject but never seize the top, so a mis-detection can't hijack a topical
//     query.

import { parseRef, scanReferences, type VerseRange } from './ref-parse';

export interface Intent {
  inject: VerseRange[]; // all named ranges — soft-boost the reranker pool
  floor: VerseRange[]; // high-confidence subset — reserve the top slots for these
}

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

// General biblical vocabulary — the domain's lexicon, NOT tuned to any query set.
// A pericope match earns the floor only when a token from HERE survives after the
// matched pericope phrase is stripped out (i.e. the query carries scriptural
// context beyond the idiom itself). Book names, core theology, and major figures.
const BIBLICAL_LEXICON: ReadonlySet<string> = new Set(
  (
    // books
    'genesis exodus leviticus numbers deuteronomy joshua judges ruth samuel kings ' +
    'chronicles ezra nehemiah esther job psalm psalms proverbs ecclesiastes song ' +
    'isaiah jeremiah lamentations ezekiel daniel hosea joel amos obadiah jonah micah ' +
    'nahum habakkuk zephaniah haggai zechariah malachi matthew mark luke acts romans ' +
    'corinthians galatians ephesians philippians colossians thessalonians timothy ' +
    'titus philemon hebrews james jude revelation gospel gospels epistle epistles ' +
    // theology / worship
    'god lord jesus christ messiah savior saviour holy spirit scripture scriptures ' +
    'bible biblical verse verses passage chapter testament parable parables disciple ' +
    'disciples apostle apostles prophet prophets prophecy covenant righteousness ' +
    'salvation sin sins sinner repentance grace faith faithful believe belief holiness ' +
    'heaven heavenly hell kingdom resurrection risen raised raising rose crucified ' +
    'crucifixion cross atonement redemption redeemer sabbath temple synagogue priest ' +
    'pharisee pharisees gentile gentiles israel israelite israelites tongues angel ' +
    'angels miracle miracles blessed glory worship preach sermon creation flood ark ' +
    'passover manna tabernacle sacrifice prayer baptism baptized communion trinity ' +
    'incarnation exile babylon egypt jerusalem zion bethlehem nazareth galilee calvary ' +
    // major figures
    'moses aaron joshua samuel abraham sarah isaac jacob esau joseph noah adam eve ' +
    'cain abel david solomon saul elijah elisha isaiah jeremiah ezekiel daniel jonah ' +
    'job esther nehemiah ezra shadrach meshach abednego nebuchadnezzar pharaoh herod ' +
    'pilate paul peter andrew philip bartholomew thomas matthew mary martha lazarus ' +
    'judas stephen barnabas timothy titus cornelius goliath samson gideon deborah ' +
    'boaz naaman zacchaeus nicodemus caiaphas'
  ).split(' '),
);

const normalize = (text: string) => ` ${text.toLowerCase().replace(/[^a-z0-9]+/g, ' ').replace(/\s+/g, ' ').trim()} `;

// Resolve reference strings ("Matthew 5-7") to canonical ranges via parseRef.
function resolveRefStrings(refs: string[]): VerseRange[] {
  const out: VerseRange[] = [];
  for (const s of refs) { const o = parseRef(s); if (o.ok) out.push(...o.ref.ranges); }
  return out;
}

// Named pericopes present in the text, each with the specific alias that matched
// (needed to strip it before the corroboration check).
function findPericopes(norm: string): Array<{ alias: string; ranges: VerseRange[] }> {
  const out: Array<{ alias: string; ranges: VerseRange[] }> = [];
  for (const p of PERICOPES) {
    // Record the SHORTEST matching alias (the proper-noun core). Corroboration
    // strips it, so a longer alias must not swallow a descriptive context word
    // ("raising of lazarus" would eat "raising"; stripping "lazarus" keeps it).
    const matches = p.aliases.filter((a) => norm.includes(` ${a} `));
    if (matches.length) {
      const alias = matches.reduce((s, a) => (a.length < s.length ? a : s));
      out.push({ alias, ranges: resolveRefStrings(p.refs) });
    }
  }
  return out;
}

// All named-pericope ranges present in the text (inject-level; no corroboration).
export function matchPericopes(text: string): VerseRange[] {
  return findPericopes(normalize(text)).flatMap((p) => p.ranges);
}

// Does the query carry biblical context BEYOND the matched pericope phrases? Two
// or more named passages already corroborate each other; otherwise a lexicon
// token must survive after the matched aliases are removed.
function pericopesCorroborated(norm: string, matched: Array<{ alias: string }>): boolean {
  if (matched.length >= 2) return true;
  let stripped = norm;
  for (const m of matched) stripped = stripped.split(` ${m.alias} `).join(' ');
  return stripped.trim().split(/\s+/).some((tok) => BIBLICAL_LEXICON.has(tok));
}

const dedup = (ranges: VerseRange[]): VerseRange[] => {
  const seen = new Set<string>();
  return ranges.filter((r) => { const k = `${r.start}-${r.end}`; if (seen.has(k)) return false; seen.add(k); return true; });
};

// The retrieval intent, split by confidence. `inject` = every range the query
// names (soft-boost the pool). `floor` = the subset trusted to seize the top
// slots: numeric references (always) + corroborated pericopes. Topical queries
// yield empty on both ⇒ semantic retrieval unchanged.
export function resolveIntent(query: string): Intent {
  const inject: VerseRange[] = [];
  const floor: VerseRange[] = [];

  // Numeric references — high precision (a chapter/verse number is explicit intent).
  for (const r of scanReferences(query)) { inject.push(...r.ranges); floor.push(...r.ranges); }

  // Named pericopes — always inject; floor only when biblically corroborated.
  const norm = normalize(query);
  const pericopes = findPericopes(norm);
  const floorPericopes = pericopesCorroborated(norm, pericopes);
  for (const p of pericopes) {
    inject.push(...p.ranges);
    if (floorPericopes) floor.push(...p.ranges);
  }

  return { inject: dedup(inject), floor: dedup(floor) };
}

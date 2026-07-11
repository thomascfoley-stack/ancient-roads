// Held-out launch-gate eval — FRESH v3 query set (docs/HELDOUT_EVAL_DESIGN.md).
//
// Minted 2026-07-11 as the real beta gate: DISJOINT from v2 (heldout-queries.mts)
// and its pilot, same composition (verse-ref 40 · pericope 15 · epistle 25 ·
// topical 20 · proper-noun 10 · control 10 = 120), stratified across the canon,
// frozen + content-hashed BEFORE any accuracy number exists.
//
// Labels — SAME methodology as v2:
//  • verse-ref / pericope / proper-noun: OBJECTIVE — the query names the passage;
//    the label is the passage's chapter range via the tested parseRef. Authoritative
//    by fact.
//  • epistle / topical: the doctrine's defining texts — Westminster Shorter (WSC) /
//    Heidelberg (HC) proof-texts where a catechism Q maps, else `locus` (the
//    doctrine's universally-recognized proof-texts). `source` records provenance.
//  • control: expected = [] (PASS = no floor hijack / honest empty).
//
// ⚠️ LABEL PROVENANCE CAVEAT (flagged for owner): the doctrinal (epistle/topical)
// labels were authored UNATTENDED from the WSC/HC + locus methodology, NOT machine-
// fetched from a PD proof-text edition (the fetch 404'd during this session). The
// OBJECTIVE 75 (verse-ref/pericope/proper-noun/control) are fully authoritative and
// need no audit. Recommend the owner spot-verify the 45 doctrinal labels against a
// WSC/HC proof-text edition before the v3 topical/epistle number is treated as final.

import type { Q } from './heldout-queries.mjs';

export const FROZEN_V3: Q[] = [
  // ── Canon-coverage verse-ref (40) — famous chapters, DISJOINT from v2's verse-ref set ──
  { id: 'v3-vr-01', cat: 'verse-ref', query: 'Genesis 1, in the beginning God created the heavens and the earth', expected: ['Genesis 1'] },
  { id: 'v3-vr-02', cat: 'verse-ref', query: 'Genesis 3, the serpent and the fall in the garden', expected: ['Genesis 3'] },
  { id: 'v3-vr-03', cat: 'verse-ref', query: 'Exodus 3, the burning bush and I AM WHO I AM', expected: ['Exodus 3'] },
  { id: 'v3-vr-04', cat: 'verse-ref', query: 'Exodus 20, the giving of the Ten Commandments at Sinai', expected: ['Exodus 20'] },
  { id: 'v3-vr-05', cat: 'verse-ref', query: 'Leviticus 19, you shall love your neighbor as yourself', expected: ['Leviticus 19'] },
  { id: 'v3-vr-06', cat: 'verse-ref', query: 'Numbers 13, the twelve spies sent into Canaan', expected: ['Numbers 13'] },
  { id: 'v3-vr-07', cat: 'verse-ref', query: 'Deuteronomy 8, man does not live by bread alone', expected: ['Deuteronomy 8'] },
  { id: 'v3-vr-08', cat: 'verse-ref', query: 'Joshua 24, choose this day whom you will serve', expected: ['Joshua 24'] },
  { id: 'v3-vr-09', cat: 'verse-ref', query: '1 Samuel 17, David and Goliath in the valley of Elah', expected: ['1 Samuel 17'] },
  { id: 'v3-vr-10', cat: 'verse-ref', query: '2 Samuel 7, God’s covenant promise to David', expected: ['2 Samuel 7'] },
  { id: 'v3-vr-11', cat: 'verse-ref', query: '1 Kings 18, Elijah on Mount Carmel against the prophets of Baal', expected: ['1 Kings 18'] },
  { id: 'v3-vr-12', cat: 'verse-ref', query: '2 Kings 5, Naaman the leper washed seven times in the Jordan', expected: ['2 Kings 5'] },
  { id: 'v3-vr-13', cat: 'verse-ref', query: '2 Chronicles 7, if my people humble themselves and pray', expected: ['2 Chronicles 7'] },
  { id: 'v3-vr-14', cat: 'verse-ref', query: 'Esther 4, for such a time as this', expected: ['Esther 4'] },
  { id: 'v3-vr-15', cat: 'verse-ref', query: 'Job 1, the LORD gave and the LORD has taken away', expected: ['Job 1'] },
  { id: 'v3-vr-16', cat: 'verse-ref', query: 'Psalm 1, blessed is the man who walks not in the counsel of the wicked', expected: ['Psalm 1'] },
  { id: 'v3-vr-17', cat: 'verse-ref', query: 'Psalm 23, the LORD is my shepherd I shall not want', expected: ['Psalm 23'] },
  { id: 'v3-vr-18', cat: 'verse-ref', query: 'Psalm 121, I lift up my eyes to the hills', expected: ['Psalm 121'] },
  { id: 'v3-vr-19', cat: 'verse-ref', query: 'Proverbs 3, trust in the LORD with all your heart', expected: ['Proverbs 3'] },
  { id: 'v3-vr-20', cat: 'verse-ref', query: 'Ecclesiastes 12, remember your Creator in the days of your youth', expected: ['Ecclesiastes 12'] },
  { id: 'v3-vr-21', cat: 'verse-ref', query: 'Song of Solomon 2, I am my beloved’s and my beloved is mine', expected: ['Song of Solomon 2'] },
  { id: 'v3-vr-22', cat: 'verse-ref', query: 'Isaiah 53, he was pierced for our transgressions', expected: ['Isaiah 53'] },
  { id: 'v3-vr-23', cat: 'verse-ref', query: 'Isaiah 55, come everyone who thirsts come to the waters', expected: ['Isaiah 55'] },
  { id: 'v3-vr-24', cat: 'verse-ref', query: 'Jeremiah 1, before I formed you in the womb I knew you', expected: ['Jeremiah 1'] },
  { id: 'v3-vr-25', cat: 'verse-ref', query: 'Ezekiel 37, the valley of dry bones comes to life', expected: ['Ezekiel 37'] },
  { id: 'v3-vr-26', cat: 'verse-ref', query: 'Daniel 6, Daniel in the den of lions', expected: ['Daniel 6'] },
  { id: 'v3-vr-27', cat: 'verse-ref', query: 'Zephaniah 3, the LORD your God is in your midst a mighty one', expected: ['Zephaniah 3'] },
  { id: 'v3-vr-28', cat: 'verse-ref', query: 'Micah 5, from Bethlehem shall come forth a ruler in Israel', expected: ['Micah 5'] },
  { id: 'v3-vr-29', cat: 'verse-ref', query: 'Matthew 5, the Beatitudes, blessed are the poor in spirit', expected: ['Matthew 5'] },
  { id: 'v3-vr-30', cat: 'verse-ref', query: 'Matthew 6, the Lord’s Prayer, our Father in heaven', expected: ['Matthew 6'] },
  { id: 'v3-vr-31', cat: 'verse-ref', query: 'Mark 4, Jesus calms the storm on the sea', expected: ['Mark 4'] },
  { id: 'v3-vr-32', cat: 'verse-ref', query: 'Luke 24, the road to Emmaus and the risen Christ', expected: ['Luke 24'] },
  { id: 'v3-vr-33', cat: 'verse-ref', query: 'John 1, in the beginning was the Word and the Word was God', expected: ['John 1'] },
  { id: 'v3-vr-34', cat: 'verse-ref', query: 'John 3, for God so loved the world that he gave his only Son', expected: ['John 3'] },
  { id: 'v3-vr-35', cat: 'verse-ref', query: 'Acts 9, the conversion of Saul on the road to Damascus', expected: ['Acts 9'] },
  { id: 'v3-vr-36', cat: 'verse-ref', query: 'Romans 8, there is no condemnation for those in Christ Jesus', expected: ['Romans 8'] },
  { id: 'v3-vr-37', cat: 'verse-ref', query: '1 Corinthians 13, love is patient love is kind', expected: ['1 Corinthians 13'] },
  { id: 'v3-vr-38', cat: 'verse-ref', query: 'Galatians 5, the fruit of the Spirit is love joy peace', expected: ['Galatians 5'] },
  { id: 'v3-vr-39', cat: 'verse-ref', query: 'Philippians 2, Christ emptied himself taking the form of a servant', expected: ['Philippians 2'] },
  { id: 'v3-vr-40', cat: 'verse-ref', query: 'Revelation 21, a new heaven and a new earth, God wipes every tear', expected: ['Revelation 21'] },

  // ── Held-out pericopes (15) — DISJOINT from v2 pericopes ──
  { id: 'v3-pc-01', cat: 'pericope', query: 'Noah and the ark and the great flood', expected: ['Genesis 6', 'Genesis 7'], notes: 'not in gazetteer' },
  { id: 'v3-pc-02', cat: 'pericope', query: 'the tower of Babel and the confusion of languages', expected: ['Genesis 11'], notes: 'not in gazetteer' },
  { id: 'v3-pc-03', cat: 'pericope', query: 'Abraham and the sacrifice of Isaac stayed by the angel', expected: ['Genesis 22'], notes: 'not in gazetteer' },
  { id: 'v3-pc-04', cat: 'pericope', query: 'Moses and the burning bush that was not consumed', expected: ['Exodus 3'], notes: 'not in gazetteer' },
  { id: 'v3-pc-05', cat: 'pericope', query: 'the golden calf at the foot of the mountain', expected: ['Exodus 32'], notes: 'not in gazetteer' },
  { id: 'v3-pc-06', cat: 'pericope', query: 'Daniel’s three friends in the fiery furnace', expected: ['Daniel 3'], notes: 'not in gazetteer' },
  { id: 'v3-pc-07', cat: 'pericope', query: 'the handwriting on the wall at Belshazzar’s feast', expected: ['Daniel 5'], notes: 'not in gazetteer' },
  { id: 'v3-pc-08', cat: 'pericope', query: 'the wise men following the star to the child', expected: ['Matthew 2'], notes: 'not in gazetteer' },
  { id: 'v3-pc-09', cat: 'pericope', query: 'the feeding of the five thousand with loaves and fish', expected: ['Matthew 14', 'Mark 6', 'John 6'], notes: 'not in gazetteer' },
  { id: 'v3-pc-10', cat: 'pericope', query: 'the raising of Lazarus from the tomb after four days', expected: ['John 11'], notes: 'not in gazetteer' },
  { id: 'v3-pc-11', cat: 'pericope', query: 'the annunciation to Mary by the angel Gabriel', expected: ['Luke 1'], notes: 'not in gazetteer' },
  { id: 'v3-pc-12', cat: 'pericope', query: 'doubting Thomas and the wounds of the risen Christ', expected: ['John 20'], notes: 'not in gazetteer' },
  { id: 'v3-pc-13', cat: 'pericope', query: 'Philip and the Ethiopian eunuch reading Isaiah', expected: ['Acts 8'], notes: 'not in gazetteer' },
  { id: 'v3-pc-14', cat: 'pericope', query: 'Paul and Silas singing in the Philippian jail', expected: ['Acts 16'], notes: 'not in gazetteer' },
  { id: 'v3-pc-15', cat: 'pericope', query: 'the wedding at Cana where water became wine', expected: ['John 2'], notes: 'not in gazetteer' },

  // ── Epistle-topic (25) — DISJOINT doctrines; labels = WSC/HC proof-texts + locus ──
  { id: 'v3-ep-01', cat: 'epistle', query: 'the atonement, Christ a sacrifice bearing our sins', expected: ['Isaiah 53', 'Romans 3', 'Hebrews 9', '1 Peter 2'], source: 'HC LD15 + locus' },
  { id: 'v3-ep-02', cat: 'epistle', query: 'Christ our substitute, the just for the unjust', expected: ['2 Corinthians 5', '1 Peter 3', 'Isaiah 53', 'Galatians 3'], source: 'locus' },
  { id: 'v3-ep-03', cat: 'epistle', query: 'the incarnation, the Word became flesh and dwelt among us', expected: ['John 1', 'Philippians 2', 'Hebrews 2', 'Galatians 4'], source: 'WSC Q22' },
  { id: 'v3-ep-04', cat: 'epistle', query: 'the humiliation of Christ unto death on a cross', expected: ['Philippians 2', 'Isaiah 53', 'Hebrews 5', 'Luke 22'], source: 'WSC Q27' },
  { id: 'v3-ep-05', cat: 'epistle', query: 'the exaltation of Christ, raised and ascended in glory', expected: ['Acts 1', 'Ephesians 1', 'Hebrews 1', 'Philippians 2'], source: 'WSC Q28 + HC LD18' },
  { id: 'v3-ep-06', cat: 'epistle', query: 'Christ our intercessor who ever lives to pray for us', expected: ['Hebrews 7', 'Romans 8', '1 John 2', 'Hebrews 9'], source: 'locus' },
  { id: 'v3-ep-07', cat: 'epistle', query: 'Christ the prophet who reveals the will of God', expected: ['John 1', 'Hebrews 1', 'Deuteronomy 18', 'Acts 3'], source: 'WSC Q24' },
  { id: 'v3-ep-08', cat: 'epistle', query: 'Christ the king who reigns over all things', expected: ['Psalm 2', '1 Corinthians 15', 'Colossians 1', 'Ephesians 1'], source: 'WSC Q26' },
  { id: 'v3-ep-09', cat: 'epistle', query: 'what saving faith in Jesus Christ is', expected: ['John 1', 'Philippians 3', 'Hebrews 11', 'Galatians 2'], source: 'WSC Q86' },
  { id: 'v3-ep-10', cat: 'epistle', query: 'the second Adam undoing the first Adam’s fall', expected: ['Romans 5', '1 Corinthians 15'], source: 'locus' },
  { id: 'v3-ep-11', cat: 'epistle', query: 'the priesthood of all believers offering spiritual sacrifices', expected: ['1 Peter 2', 'Revelation 1', 'Hebrews 13'], source: 'locus' },
  { id: 'v3-ep-12', cat: 'epistle', query: 'the church as the one body and bride of Christ', expected: ['Ephesians 5', '1 Corinthians 12', 'Colossians 1', 'Ephesians 4'], source: 'HC LD21 + locus' },
  { id: 'v3-ep-13', cat: 'epistle', query: 'the Lord’s Supper, the communion of the body and blood of Christ', expected: ['1 Corinthians 11', '1 Corinthians 10', 'Matthew 26', 'Luke 22'], source: 'WSC Q96 + HC LD28' },
  { id: 'v3-ep-14', cat: 'epistle', query: 'baptism in the name of the Father Son and Holy Spirit', expected: ['Matthew 28', 'Acts 2', 'Acts 22', 'Titus 3'], source: 'WSC Q94' },
  { id: 'v3-ep-15', cat: 'epistle', query: 'the word of God living and active and profitable', expected: ['Hebrews 4', '2 Timothy 3', 'Romans 10', 'Psalm 19'], source: 'WSC Q89 + locus' },
  { id: 'v3-ep-16', cat: 'epistle', query: 'the fear of the Lord and the judgment seat of Christ', expected: ['2 Corinthians 5', 'Romans 14', 'Hebrews 10'], source: 'locus' },
  { id: 'v3-ep-17', cat: 'epistle', query: 'the freedom of the Christian from the bondage of sin', expected: ['Romans 6', 'John 8', 'Galatians 5'], source: 'HC LD34 + locus' },
  { id: 'v3-ep-18', cat: 'epistle', query: 'suffering with Christ and sharing in his glory', expected: ['Romans 8', '2 Corinthians 4', '1 Peter 4', 'Philippians 3'], source: 'locus' },
  { id: 'v3-ep-19', cat: 'epistle', query: 'the gift of eternal life in the Son', expected: ['1 John 5', 'John 5', 'John 6', 'Romans 6'], source: 'HC LD22 + locus' },
  { id: 'v3-ep-20', cat: 'epistle', query: 'God’s discipline of the children he loves', expected: ['Hebrews 12', 'Proverbs 3', 'Revelation 3'], source: 'locus' },
  { id: 'v3-ep-21', cat: 'epistle', query: 'the whole armour of God against spiritual powers', expected: ['Ephesians 6', '2 Corinthians 10', '1 Thessalonians 5'], source: 'locus' },
  { id: 'v3-ep-22', cat: 'epistle', query: 'thanksgiving and contentment in every circumstance', expected: ['Philippians 4', '1 Timothy 6', 'Colossians 3', '1 Thessalonians 5'], source: 'locus' },
  { id: 'v3-ep-23', cat: 'epistle', query: 'the mystery of the gospel revealed to the nations', expected: ['Ephesians 3', 'Colossians 1', 'Romans 16'], source: 'locus' },
  { id: 'v3-ep-24', cat: 'epistle', query: 'the sufferings of the present time and the glory to come', expected: ['Romans 8', '2 Corinthians 4', '1 Peter 1'], source: 'locus' },
  { id: 'v3-ep-25', cat: 'epistle', query: 'love as the fulfilling of the law', expected: ['Romans 13', '1 Corinthians 13', 'Galatians 5', 'James 2'], source: 'WSC Q42 + locus' },

  // ── General topical (20) — DISJOINT doctrines; labels = WSC/HC proof-texts + locus ──
  { id: 'v3-tp-01', cat: 'topical', query: 'the holiness of God and be holy as I am holy', expected: ['Leviticus 19', 'Isaiah 6', '1 Peter 1'], source: 'locus' },
  { id: 'v3-tp-02', cat: 'topical', query: 'the mercy and compassion of God toward sinners', expected: ['Exodus 34', 'Psalm 103', 'Lamentations 3', 'Luke 15'], source: 'locus' },
  { id: 'v3-tp-03', cat: 'topical', query: 'what sin is and the transgression of the law', expected: ['Romans 3', 'James 2', '1 John 3', 'Genesis 3'], source: 'WSC Q14' },
  { id: 'v3-tp-04', cat: 'topical', query: 'the fall of mankind in Adam’s first sin', expected: ['Genesis 3', 'Romans 5'], source: 'WSC Q13-16' },
  { id: 'v3-tp-05', cat: 'topical', query: 'keeping the Sabbath day holy and resting in God', expected: ['Genesis 2', 'Exodus 20', 'Isaiah 58', 'Hebrews 4'], source: 'WSC Q57-58' },
  { id: 'v3-tp-06', cat: 'topical', query: 'honoring father and mother and the family', expected: ['Exodus 20', 'Ephesians 6', 'Colossians 3'], source: 'WSC Q63-64' },
  { id: 'v3-tp-07', cat: 'topical', query: 'work and diligence and the sluggard', expected: ['Genesis 2', 'Proverbs 6', '2 Thessalonians 3'], source: 'locus' },
  { id: 'v3-tp-08', cat: 'topical', query: 'justice and care for the poor and the needy', expected: ['Isaiah 58', 'Deuteronomy 15', 'Proverbs 14', 'James 1'], source: 'locus' },
  { id: 'v3-tp-09', cat: 'topical', query: 'truthfulness and bearing false witness', expected: ['Exodus 20', 'Proverbs 12', 'Ephesians 4'], source: 'WSC Q76-78' },
  { id: 'v3-tp-10', cat: 'topical', query: 'generosity and the grace of giving', expected: ['2 Corinthians 9', '2 Corinthians 8', 'Proverbs 11', 'Luke 6'], source: 'locus' },
  { id: 'v3-tp-11', cat: 'topical', query: 'the Holy Spirit the comforter and helper', expected: ['John 14', 'John 16', 'Acts 1', 'Romans 8'], source: 'HC LD20 + locus' },
  { id: 'v3-tp-12', cat: 'topical', query: 'praise and thanksgiving to God', expected: ['Psalm 100', 'Psalm 150', 'Colossians 3', '1 Thessalonians 5'], source: 'locus' },
  { id: 'v3-tp-13', cat: 'topical', query: 'the word of God a lamp to my feet', expected: ['Psalm 119', '2 Timothy 3', 'Deuteronomy 6'], source: 'locus' },
  { id: 'v3-tp-14', cat: 'topical', query: 'heaven and the new creation and the life to come', expected: ['Revelation 21', 'Revelation 22', '2 Peter 3', 'Isaiah 65'], source: 'HC LD22 + locus' },
  { id: 'v3-tp-15', cat: 'topical', query: 'wisdom and the fear of folly', expected: ['Proverbs 2', 'Proverbs 3', 'James 1'], source: 'locus' },
  { id: 'v3-tp-16', cat: 'topical', query: 'anger and reconciliation with a brother', expected: ['Matthew 5', 'Ephesians 4', 'James 1'], source: 'locus' },
  { id: 'v3-tp-17', cat: 'topical', query: 'the goodness of creation and the stewardship of the earth', expected: ['Genesis 1', 'Psalm 8', 'Psalm 24'], source: 'locus' },
  { id: 'v3-tp-18', cat: 'topical', query: 'trusting God and not being anxious about tomorrow', expected: ['Matthew 6', 'Philippians 4', '1 Peter 5', 'Psalm 37'], source: 'locus' },
  { id: 'v3-tp-19', cat: 'topical', query: 'loving one another as Christ has loved us', expected: ['John 13', '1 John 4', 'Romans 12'], source: 'locus' },
  { id: 'v3-tp-20', cat: 'topical', query: 'the resurrection of Christ the firstfruits', expected: ['1 Corinthians 15', 'Romans 4', 'Matthew 28'], source: 'locus' },

  // ── Proper-noun / rare (10) — DISJOINT from v2 ──
  { id: 'v3-pn-01', cat: 'proper-noun', query: 'Enoch who walked with God and was not', expected: ['Genesis 5', 'Hebrews 11', 'Jude 1'] },
  { id: 'v3-pn-02', cat: 'proper-noun', query: 'Deborah the prophetess who judged Israel', expected: ['Judges 4', 'Judges 5'] },
  { id: 'v3-pn-03', cat: 'proper-noun', query: 'Gehazi the servant of Elisha struck with leprosy', expected: ['2 Kings 5'] },
  { id: 'v3-pn-04', cat: 'proper-noun', query: 'Nebuchadnezzar who ate grass like an ox', expected: ['Daniel 4'] },
  { id: 'v3-pn-05', cat: 'proper-noun', query: 'Simeon and Anna who saw the child in the temple', expected: ['Luke 2'] },
  { id: 'v3-pn-06', cat: 'proper-noun', query: 'Nathanael whom Jesus saw under the fig tree', expected: ['John 1'] },
  { id: 'v3-pn-07', cat: 'proper-noun', query: 'Ananias and Sapphira who lied to the Holy Spirit', expected: ['Acts 5'] },
  { id: 'v3-pn-08', cat: 'proper-noun', query: 'Dorcas also called Tabitha raised by Peter', expected: ['Acts 9'] },
  { id: 'v3-pn-09', cat: 'proper-noun', query: 'the manna and the quail given in the wilderness', expected: ['Exodus 16', 'Numbers 11'] },
  { id: 'v3-pn-10', cat: 'proper-noun', query: 'the bronze laver and the altar in the tabernacle court', expected: ['Exodus 30', 'Exodus 38'] },

  // ── Negative controls (10) — idiomatic (no hijack) + out-of-corpus (honest empty) ──
  { id: 'v3-ctl-01', cat: 'control', query: 'living water plumbing and drain services', expected: [] },
  { id: 'v3-ctl-02', cat: 'control', query: 'burning bush landscaping and tree trimming', expected: [] },
  { id: 'v3-ctl-03', cat: 'control', query: 'promised land real estate listings near the coast', expected: [] },
  { id: 'v3-ctl-04', cat: 'control', query: 'daily bread bakery hours and locations', expected: [] },
  { id: 'v3-ctl-05', cat: 'control', query: 'the narrow gate climbing gym membership', expected: [] },
  { id: 'v3-ctl-06', cat: 'control', query: 'how do I change a flat tire on the highway', expected: [] },
  { id: 'v3-ctl-07', cat: 'control', query: 'cheapest flights from Chicago to Seattle in August', expected: [] },
  { id: 'v3-ctl-08', cat: 'control', query: 'the exodus of remote workers from big cities', expected: [] },
  { id: 'v3-ctl-09', cat: 'control', query: 'genesis of a startup idea over coffee', expected: [] },
  { id: 'v3-ctl-10', cat: 'control', query: 'apocalypse now movie runtime and cast', expected: [] },
];

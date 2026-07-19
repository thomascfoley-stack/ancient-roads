// Held-out launch-gate eval — FRESH v4 query set (docs/HELDOUT_EVAL_DESIGN.md §v4).
//
// Minted 2026-07-18 (Phase 3 reconcile, branch `reconcile-measure`) as the fresh
// held-out no fix was ever tuned against: DISJOINT from the pilot, v2
// (heldout-queries.mts) and v3 (heldout-v3-queries.mts) — no query reuses a
// passage, pericope, or phrasing from any prior set. Same composition
// (verse-ref 40 · pericope 15 · epistle 25 · topical 20 · proper-noun 10 ·
// control 10 = 120), stratified across the canon, frozen + content-hashed
// BEFORE any accuracy number exists (test/heldout-frozen-hash.test.ts).
//
// LABELING — the v4 discipline (fixes the v3 RELABEL circularity flagged by A6):
//  • EVERY label is derived from the query's own scripture reference or wording,
//    NEVER from retrieval output. There is no relabel path for v4; a label
//    correction requires re-freezing as v4.1 with a new hash.
//  • verse-ref: the query names book+chapter — objective by fact.
//  • pericope: the query names a narrative; the label is the chapter(s) where
//    that narrative lies — objective by fact of the text.
//  • epistle / topical: the query QUOTES (or tightly paraphrases) identifiable
//    KJV phrases; the label = the chapters containing those phrases. Each
//    anchor is recorded in `source` and was mechanically verified against the
//    in-repo KJV (web/public/bible/kjv) before the freeze. No catechism-mapping
//    judgment calls, no "acceptable passages" authored from memory.
//  • control: expected = [] (PASS = no floor hijack / honest empty).

import type { Q } from './heldout-queries.mjs';

export const FROZEN_V4: Q[] = [
  // ── Canon-coverage verse-ref (40) — famous chapters, DISJOINT from v2/v3/pilot ──
  { id: 'v4-vr-01', cat: 'verse-ref', query: 'Genesis 2, the garden planted in Eden and the tree of life', expected: ['Genesis 2'] },
  { id: 'v4-vr-02', cat: 'verse-ref', query: 'Genesis 12, the call of Abram, in thee shall all families be blessed', expected: ['Genesis 12'] },
  { id: 'v4-vr-03', cat: 'verse-ref', query: 'Exodus 12, the Passover lamb and the blood on the doorposts', expected: ['Exodus 12'] },
  { id: 'v4-vr-04', cat: 'verse-ref', query: 'Exodus 33, Moses prays show me thy glory', expected: ['Exodus 33'] },
  { id: 'v4-vr-05', cat: 'verse-ref', query: 'Leviticus 25, the year of jubilee and liberty proclaimed', expected: ['Leviticus 25'] },
  { id: 'v4-vr-06', cat: 'verse-ref', query: 'Numbers 20, Moses strikes the rock at the waters of Meribah', expected: ['Numbers 20'] },
  { id: 'v4-vr-07', cat: 'verse-ref', query: 'Deuteronomy 30, I have set before you life and death, choose life', expected: ['Deuteronomy 30'] },
  { id: 'v4-vr-08', cat: 'verse-ref', query: 'Joshua 1, be strong and of a good courage', expected: ['Joshua 1'] },
  { id: 'v4-vr-09', cat: 'verse-ref', query: 'Judges 16, Samson and Delilah and the pillars of the house', expected: ['Judges 16'] },
  { id: 'v4-vr-10', cat: 'verse-ref', query: 'Ruth 2, Ruth gleaning in the field of Boaz', expected: ['Ruth 2'] },
  { id: 'v4-vr-11', cat: 'verse-ref', query: '2 Samuel 6, David dances before the ark of the LORD', expected: ['2 Samuel 6'] },
  { id: 'v4-vr-12', cat: 'verse-ref', query: '1 Kings 8, Solomon’s prayer at the dedication of the temple', expected: ['1 Kings 8'] },
  { id: 'v4-vr-13', cat: 'verse-ref', query: '2 Kings 22, Josiah and the book of the law found in the temple', expected: ['2 Kings 22'] },
  { id: 'v4-vr-14', cat: 'verse-ref', query: '2 Chronicles 20, the battle is not yours but God’s', expected: ['2 Chronicles 20'] },
  { id: 'v4-vr-15', cat: 'verse-ref', query: 'Job 19, I know that my redeemer liveth', expected: ['Job 19'] },
  { id: 'v4-vr-16', cat: 'verse-ref', query: 'Psalm 8, what is man that thou art mindful of him', expected: ['Psalm 8'] },
  { id: 'v4-vr-17', cat: 'verse-ref', query: 'Psalm 46, God is our refuge and strength, a very present help', expected: ['Psalm 46'] },
  { id: 'v4-vr-18', cat: 'verse-ref', query: 'Psalm 90, teach us to number our days', expected: ['Psalm 90'] },
  { id: 'v4-vr-19', cat: 'verse-ref', query: 'Proverbs 31, the virtuous woman whose price is far above rubies', expected: ['Proverbs 31'] },
  { id: 'v4-vr-20', cat: 'verse-ref', query: 'Ecclesiastes 1, vanity of vanities, all is vanity', expected: ['Ecclesiastes 1'] },
  { id: 'v4-vr-21', cat: 'verse-ref', query: 'Isaiah 9, unto us a child is born, the Prince of Peace', expected: ['Isaiah 9'] },
  { id: 'v4-vr-22', cat: 'verse-ref', query: 'Isaiah 61, the Spirit of the Lord GOD is upon me, good tidings to the meek', expected: ['Isaiah 61'] },
  { id: 'v4-vr-23', cat: 'verse-ref', query: 'Jeremiah 29, the letter to the exiles, thoughts of peace and not of evil', expected: ['Jeremiah 29'] },
  { id: 'v4-vr-24', cat: 'verse-ref', query: 'Ezekiel 34, the shepherds of Israel who feed themselves and not the flock', expected: ['Ezekiel 34'] },
  { id: 'v4-vr-25', cat: 'verse-ref', query: 'Daniel 7, one like the Son of man coming with the clouds of heaven', expected: ['Daniel 7'] },
  { id: 'v4-vr-26', cat: 'verse-ref', query: 'Jonah 4, the gourd and God’s pity on Nineveh', expected: ['Jonah 4'] },
  { id: 'v4-vr-27', cat: 'verse-ref', query: 'Zechariah 4, not by might nor by power but by my spirit', expected: ['Zechariah 4'] },
  { id: 'v4-vr-28', cat: 'verse-ref', query: 'Malachi 4, the Sun of righteousness with healing in his wings', expected: ['Malachi 4'] },
  { id: 'v4-vr-29', cat: 'verse-ref', query: 'Matthew 28, the Great Commission, go and teach all nations', expected: ['Matthew 28'] },
  { id: 'v4-vr-30', cat: 'verse-ref', query: 'Mark 10, the Son of man came to give his life a ransom for many', expected: ['Mark 10'] },
  { id: 'v4-vr-31', cat: 'verse-ref', query: 'Luke 4, Jesus reads Isaiah in the synagogue at Nazareth', expected: ['Luke 4'] },
  { id: 'v4-vr-32', cat: 'verse-ref', query: 'John 10, the good shepherd who lays down his life for the sheep', expected: ['John 10'] },
  { id: 'v4-vr-33', cat: 'verse-ref', query: 'John 14, in my Father’s house are many mansions, the way the truth and the life', expected: ['John 14'] },
  { id: 'v4-vr-34', cat: 'verse-ref', query: 'Acts 17, Paul at Mars’ hill and the unknown god', expected: ['Acts 17'] },
  { id: 'v4-vr-35', cat: 'verse-ref', query: 'Romans 5, peace with God, while we were yet sinners Christ died for us', expected: ['Romans 5'] },
  { id: 'v4-vr-36', cat: 'verse-ref', query: 'Ephesians 2, by grace are ye saved through faith', expected: ['Ephesians 2'] },
  { id: 'v4-vr-37', cat: 'verse-ref', query: '1 Thessalonians 4, caught up together in the clouds to meet the Lord', expected: ['1 Thessalonians 4'] },
  { id: 'v4-vr-38', cat: 'verse-ref', query: '2 Timothy 2, a workman not ashamed, rightly dividing the word of truth', expected: ['2 Timothy 2'] },
  { id: 'v4-vr-39', cat: 'verse-ref', query: '1 Peter 2, a royal priesthood, a holy nation, a peculiar people', expected: ['1 Peter 2'] },
  { id: 'v4-vr-40', cat: 'verse-ref', query: 'Revelation 3, behold I stand at the door and knock', expected: ['Revelation 3'] },

  // ── Held-out pericopes (15) — narratives DISJOINT from v2/v3/pilot pericopes ──
  { id: 'v4-pc-01', cat: 'pericope', query: 'Jacob wrestles with the angel at Peniel until the breaking of day', expected: ['Genesis 32'], notes: 'not in gazetteer' },
  { id: 'v4-pc-02', cat: 'pericope', query: 'the crossing of the Jordan on dry ground with the ark', expected: ['Joshua 3', 'Joshua 4'], notes: 'not in gazetteer' },
  { id: 'v4-pc-03', cat: 'pericope', query: 'Elijah and the widow of Zarephath whose meal and oil did not fail', expected: ['1 Kings 17'], notes: 'not in gazetteer' },
  { id: 'v4-pc-04', cat: 'pericope', query: 'Hezekiah’s sickness and the shadow turned back on the sundial', expected: ['2 Kings 20', 'Isaiah 38'], notes: 'not in gazetteer' },
  { id: 'v4-pc-05', cat: 'pericope', query: 'Esther’s banquet and the downfall of Haman', expected: ['Esther 7'], notes: 'not in gazetteer' },
  { id: 'v4-pc-06', cat: 'pericope', query: 'the potter’s house and the vessel marred in the potter’s hand', expected: ['Jeremiah 18'], notes: 'not in gazetteer' },
  { id: 'v4-pc-07', cat: 'pericope', query: 'the ten lepers healed and the one who returned to give thanks', expected: ['Luke 17'], notes: 'not in gazetteer' },
  { id: 'v4-pc-08', cat: 'pericope', query: 'the widow who cast her two mites into the treasury', expected: ['Mark 12', 'Luke 21'], notes: 'not in gazetteer' },
  { id: 'v4-pc-09', cat: 'pericope', query: 'the rich man and the beggar Lazarus at his gate', expected: ['Luke 16'], notes: 'not in gazetteer' },
  { id: 'v4-pc-10', cat: 'pericope', query: 'the laborers in the vineyard hired at the eleventh hour', expected: ['Matthew 20'], notes: 'not in gazetteer' },
  { id: 'v4-pc-11', cat: 'pericope', query: 'the woman who anointed Jesus at Bethany with the alabaster box', expected: ['Matthew 26', 'Mark 14', 'John 12'], notes: 'not in gazetteer' },
  { id: 'v4-pc-12', cat: 'pericope', query: 'Peter delivered from prison by the angel in the night', expected: ['Acts 12'], notes: 'not in gazetteer' },
  { id: 'v4-pc-13', cat: 'pericope', query: 'Paul’s shipwreck and the escape to the island of Melita', expected: ['Acts 27', 'Acts 28'], notes: 'not in gazetteer' },
  { id: 'v4-pc-14', cat: 'pericope', query: 'Eutychus who fell from the window during Paul’s long sermon', expected: ['Acts 20'], notes: 'not in gazetteer' },
  { id: 'v4-pc-15', cat: 'pericope', query: 'the cleansing of the temple and the overturning of the money changers’ tables', expected: ['Matthew 21', 'Mark 11'], notes: 'not in gazetteer; synoptic accounts' },

  // ── Epistle-topic (25) — phrase-anchored; label = chapters containing the quoted
  // KJV wording (anchors in `source`, verified against web/public/bible/kjv) ──
  { id: 'v4-ep-01', cat: 'epistle', query: 'given to hospitality, entertaining strangers and angels unawares', expected: ['Romans 12', 'Hebrews 13', '1 Peter 4'], source: 'KJV Rom 12:13 "given to hospitality" · Heb 13:2 "entertained angels unawares" · 1 Pet 4:9 "use hospitality one to another"' },
  { id: 'v4-ep-02', cat: 'epistle', query: 'servants obedient to their own masters, and masters giving what is just', expected: ['Ephesians 6', 'Colossians 3', 'Colossians 4', 'Titus 2', '1 Peter 2'], source: 'KJV Eph 6:5 · Col 3:22 · Col 4:1 · Titus 2:9 · 1 Pet 2:18 (servants/masters)' },
  { id: 'v4-ep-03', cat: 'epistle', query: 'subjection to the higher powers and honoring the king', expected: ['Romans 13', '1 Peter 2', 'Titus 3'], source: 'KJV Rom 13:1 "subject unto the higher powers" · 1 Pet 2:17 "Honour the king" · Titus 3:1 "subject to principalities and powers"' },
  { id: 'v4-ep-04', cat: 'epistle', query: 'all scripture given by inspiration of God, holy men moved by the Holy Ghost', expected: ['2 Timothy 3', '2 Peter 1'], source: 'KJV 2 Tim 3:16 · 2 Pet 1:21' },
  { id: 'v4-ep-05', cat: 'epistle', query: 'false teachers who privily bring in damnable heresies, crept in unawares', expected: ['2 Peter 2', 'Jude 1'], source: 'KJV 2 Pet 2:1 · Jude 4' },
  { id: 'v4-ep-06', cat: 'epistle', query: 'believe not every spirit, but try the spirits whether they are of God', expected: ['1 John 4', '2 John 1'], source: 'KJV 1 Jn 4:1 · 2 Jn 7 (confess not Christ come in the flesh)' },
  { id: 'v4-ep-07', cat: 'epistle', query: 'the brother weak in the faith and meat offered unto idols', expected: ['Romans 14', '1 Corinthians 8', '1 Corinthians 10'], source: 'KJV Rom 14:1 · 1 Cor 8:4,13 · 1 Cor 10:28' },
  { id: 'v4-ep-08', cat: 'epistle', query: 'running the race with patience, pressing toward the mark for the prize', expected: ['1 Corinthians 9', 'Hebrews 12', 'Philippians 3'], source: 'KJV 1 Cor 9:24 · Heb 12:1 · Phil 3:14' },
  { id: 'v4-ep-09', cat: 'epistle', query: 'strangers and pilgrims on the earth whose citizenship is in heaven', expected: ['Philippians 3', 'Hebrews 11', '1 Peter 2'], source: 'KJV Phil 3:20 "our conversation is in heaven" · Heb 11:13 · 1 Pet 2:11' },
  { id: 'v4-ep-10', cat: 'epistle', query: 'the man of sin revealed and the mystery of iniquity', expected: ['2 Thessalonians 2'], source: 'KJV 2 Thess 2:3,7' },
  { id: 'v4-ep-11', cat: 'epistle', query: 'the mediator of a better covenant established upon better promises', expected: ['Hebrews 8', 'Hebrews 9', 'Jeremiah 31'], source: 'KJV Heb 8:6 · Heb 9:15 "mediator of the new testament" · Jer 31:31 "a new covenant"' },
  { id: 'v4-ep-12', cat: 'epistle', query: 'pure religion undefiled, visiting the fatherless and widows in their affliction', expected: ['James 1'], source: 'KJV Jas 1:27' },
  { id: 'v4-ep-13', cat: 'epistle', query: 'in Christ dwells all the fulness of the Godhead bodily, the express image of God', expected: ['Colossians 2', 'Colossians 1', 'Hebrews 1'], source: 'KJV Col 2:9 · Col 1:19 · Heb 1:3 "express image of his person"' },
  { id: 'v4-ep-14', cat: 'epistle', query: 'coming boldly to the throne of grace, boldness to enter the holiest', expected: ['Hebrews 4', 'Hebrews 10', 'Ephesians 3'], source: 'KJV Heb 4:16 · Heb 10:19 · Eph 3:12 "boldness and access"' },
  { id: 'v4-ep-15', cat: 'epistle', query: 'sealed with the Spirit of promise, the earnest of our inheritance', expected: ['Ephesians 1', '2 Corinthians 1', '2 Corinthians 5', 'Ephesians 4'], source: 'KJV Eph 1:13-14 · 2 Cor 1:22 · 2 Cor 5:5 · Eph 4:30' },
  { id: 'v4-ep-16', cat: 'epistle', query: 'the chief corner stone and the foundation of the apostles and prophets', expected: ['Ephesians 2', '1 Corinthians 3', '1 Peter 2', 'Isaiah 28', 'Psalm 118'], source: 'KJV Eph 2:20 · 1 Cor 3:11 · 1 Pet 2:6 · Isa 28:16 · Ps 118:22' },
  { id: 'v4-ep-17', cat: 'epistle', query: 'psalms and hymns and spiritual songs, singing with grace in your hearts', expected: ['Ephesians 5', 'Colossians 3'], source: 'KJV Eph 5:19 · Col 3:16' },
  { id: 'v4-ep-18', cat: 'epistle', query: 'the whole creation groaning and travailing, waiting for the redemption of the body', expected: ['Romans 8'], source: 'KJV Rom 8:22-23' },
  { id: 'v4-ep-19', cat: 'epistle', query: 'not forsaking the assembling of ourselves together, exhorting one another', expected: ['Hebrews 10'], source: 'KJV Heb 10:25' },
  { id: 'v4-ep-20', cat: 'epistle', query: 'the elders who feed the flock of God, the office of a bishop', expected: ['1 Peter 5', 'Acts 20', '1 Timothy 3', 'Titus 1'], source: 'KJV 1 Pet 5:2 · Acts 20:28 · 1 Tim 3:1 · Titus 1:7' },
  { id: 'v4-ep-21', cat: 'epistle', query: 'the body the temple of the Holy Ghost, flee fornication', expected: ['1 Corinthians 6', '1 Thessalonians 4'], source: 'KJV 1 Cor 6:18-19 · 1 Thess 4:3' },
  { id: 'v4-ep-22', cat: 'epistle', query: 'hope as an anchor of the soul, sure and stedfast within the veil', expected: ['Hebrews 6'], source: 'KJV Heb 6:19' },
  { id: 'v4-ep-23', cat: 'epistle', query: 'fervent charity that covers a multitude of sins', expected: ['1 Peter 4', 'Proverbs 10', 'James 5'], source: 'KJV 1 Pet 4:8 · Prov 10:12 "love covereth all sins" · Jas 5:20' },
  { id: 'v4-ep-24', cat: 'epistle', query: 'rooted and grounded in love, knowing the love of Christ that passes knowledge', expected: ['Ephesians 3'], source: 'KJV Eph 3:17-19' },
  { id: 'v4-ep-25', cat: 'epistle', query: 'begotten to a lively hope, an inheritance incorruptible that fades not away', expected: ['1 Peter 1'], source: 'KJV 1 Pet 1:3-4' },

  // ── General topical (20) — phrase-anchored; same rule as epistle ──
  { id: 'v4-tp-01', cat: 'topical', query: 'fasting seen in secret and the fast that God has chosen', expected: ['Matthew 6', 'Isaiah 58', 'Joel 2'], source: 'KJV Matt 6:17-18 · Isa 58:6 · Joel 2:12 (fasting)' },
  { id: 'v4-tp-02', cat: 'topical', query: 'the fear of man brings a snare, obeying God rather than men', expected: ['Proverbs 29', 'Matthew 10', 'Acts 5', 'Galatians 1'], source: 'KJV Prov 29:25 · Matt 10:28 · Acts 5:29 · Gal 1:10' },
  { id: 'v4-tp-03', cat: 'topical', query: 'swearing not at all, letting your yea be yea, and paying your vows', expected: ['Matthew 5', 'James 5', 'Ecclesiastes 5', 'Numbers 30'], source: 'KJV Matt 5:34-37 · Jas 5:12 · Eccl 5:4-5 · Num 30:2' },
  { id: 'v4-tp-04', cat: 'topical', query: 'loving the stranger, for you were strangers in the land of Egypt', expected: ['Deuteronomy 10', 'Leviticus 19', 'Exodus 22'], source: 'KJV Deut 10:19 · Lev 19:34 · Exod 22:21' },
  { id: 'v4-tp-05', cat: 'topical', query: 'even to old age and hoar hairs I will carry you, fruit in old age', expected: ['Isaiah 46', 'Psalm 71', 'Psalm 92', 'Proverbs 16'], source: 'KJV Isa 46:4 · Ps 71:9 · Ps 92:14 · Prov 16:31 "hoary head"' },
  { id: 'v4-tp-06', cat: 'topical', query: 'whatsoever a man sows that shall he also reap, sowing the wind and reaping the whirlwind', expected: ['Galatians 6', 'Hosea 8', '2 Corinthians 9'], source: 'KJV Gal 6:7 · Hos 8:7 · 2 Cor 9:6' },
  { id: 'v4-tp-07', cat: 'topical', query: 'the light of the world, walking as children of light', expected: ['Matthew 5', 'Ephesians 5', '1 John 1', 'John 8'], source: 'KJV Matt 5:14 · Eph 5:8 · 1 Jn 1:7 · Jn 8:12' },
  { id: 'v4-tp-08', cat: 'topical', query: 'harden not your hearts as in the provocation in the wilderness', expected: ['Psalm 95', 'Hebrews 3'], source: 'KJV Ps 95:8 · Heb 3:8' },
  { id: 'v4-tp-09', cat: 'topical', query: 'the remnant according to grace, seven thousand who have not bowed to Baal', expected: ['Isaiah 10', 'Romans 11', '1 Kings 19'], source: 'KJV Isa 10:21-22 · Rom 11:4-5 · 1 Kgs 19:18' },
  { id: 'v4-tp-10', cat: 'topical', query: 'envy the rottenness of the bones, and charity that envies not', expected: ['Proverbs 14', 'James 3', '1 Corinthians 13'], source: 'KJV Prov 14:30 · Jas 3:16 · 1 Cor 13:4' },
  { id: 'v4-tp-11', cat: 'topical', query: 'wine is a mocker, be not drunk with wine but filled with the Spirit', expected: ['Proverbs 20', 'Proverbs 23', 'Ephesians 5'], source: 'KJV Prov 20:1 · Prov 23:29-31 · Eph 5:18' },
  { id: 'v4-tp-12', cat: 'topical', query: 'the harvest plenteous but the laborers few, fields white unto harvest', expected: ['Matthew 9', 'Luke 10', 'John 4'], source: 'KJV Matt 9:37 · Luke 10:2 · Jn 4:35' },
  { id: 'v4-tp-13', cat: 'topical', query: 'the cities of refuge appointed for the manslayer who kills unawares', expected: ['Numbers 35', 'Joshua 20', 'Deuteronomy 19'], source: 'KJV Num 35:11 · Josh 20:2-3 · Deut 19:2-4' },
  { id: 'v4-tp-14', cat: 'topical', query: 'beating swords into plowshares, nation shall not lift up sword against nation', expected: ['Isaiah 2', 'Micah 4'], source: 'KJV Isa 2:4 · Mic 4:3' },
  { id: 'v4-tp-15', cat: 'topical', query: 'the eyes of the LORD in every place beholding the evil and the good', expected: ['Proverbs 15', '2 Chronicles 16', 'Jeremiah 23'], source: 'KJV Prov 15:3 · 2 Chr 16:9 · Jer 23:24 "Do not I fill heaven and earth"' },
  { id: 'v4-tp-16', cat: 'topical', query: 'a father of the fatherless and a judge of the widows', expected: ['Psalm 68', 'Isaiah 1', 'Deuteronomy 24', 'Exodus 22'], source: 'KJV Ps 68:5 · Isa 1:17 · Deut 24:17 · Exod 22:22' },
  { id: 'v4-tp-17', cat: 'topical', query: 'come all you that labor and are heavy laden, rest for your souls', expected: ['Matthew 11', 'Jeremiah 6'], source: 'KJV Matt 11:28-29 · Jer 6:16 "find rest for your souls"' },
  { id: 'v4-tp-18', cat: 'topical', query: 'the name of the LORD a strong tower where the righteous run and are safe', expected: ['Proverbs 18', 'Psalm 61'], source: 'KJV Prov 18:10 · Ps 61:3 "a strong tower from the enemy"' },
  { id: 'v4-tp-19', cat: 'topical', query: 'return to me and I will return to you, I will heal their backsliding', expected: ['Hosea 14', 'Jeremiah 3', 'Zechariah 1', 'Malachi 3'], source: 'KJV Hos 14:4 · Jer 3:22 · Zech 1:3 · Mal 3:7' },
  { id: 'v4-tp-20', cat: 'topical', query: 'iron sharpens iron, walking with the wise, evil companions corrupt good manners', expected: ['Proverbs 27', 'Proverbs 13', '1 Corinthians 15'], source: 'KJV Prov 27:17 · Prov 13:20 · 1 Cor 15:33' },

  // ── Proper-noun / rare (10) — figures/objects DISJOINT from v2/v3/pilot ──
  { id: 'v4-pn-01', cat: 'proper-noun', query: 'Achan and the accursed thing hidden in his tent', expected: ['Joshua 7'] },
  { id: 'v4-pn-02', cat: 'proper-noun', query: 'Mephibosheth the lame son of Jonathan at David’s table', expected: ['2 Samuel 9'] },
  { id: 'v4-pn-03', cat: 'proper-noun', query: 'the witch of Endor and the spirit of Samuel', expected: ['1 Samuel 28'] },
  { id: 'v4-pn-04', cat: 'proper-noun', query: 'Apollos, mighty in the scriptures, who watered what Paul planted', expected: ['Acts 18', '1 Corinthians 3'] },
  { id: 'v4-pn-05', cat: 'proper-noun', query: 'Demas who forsook Paul, having loved this present world', expected: ['2 Timothy 4', 'Colossians 4'] },
  { id: 'v4-pn-06', cat: 'proper-noun', query: 'Jephthah and his rash vow concerning his daughter', expected: ['Judges 11'] },
  { id: 'v4-pn-07', cat: 'proper-noun', query: 'the Rechabites who would drink no wine', expected: ['Jeremiah 35'] },
  { id: 'v4-pn-08', cat: 'proper-noun', query: 'king Agrippa before whom Paul made his defense, almost persuaded', expected: ['Acts 26'] },
  { id: 'v4-pn-09', cat: 'proper-noun', query: 'Naboth’s vineyard and Jezebel’s plot with the elders', expected: ['1 Kings 21'] },
  { id: 'v4-pn-10', cat: 'proper-noun', query: 'Nehushtan, the brasen serpent broken in pieces by Hezekiah', expected: ['2 Kings 18'] },

  // ── Negative controls (10) — idiomatic (no hijack) + out-of-corpus (honest empty) ──
  { id: 'v4-ctl-01', cat: 'control', query: 'garden of eden landscaping supplies coupon code', expected: [] },
  { id: 'v4-ctl-02', cat: 'control', query: 'ark of the covenant escape room tickets', expected: [] },
  { id: 'v4-ctl-03', cat: 'control', query: 'david and goliath marketing strategy for startups', expected: [] },
  { id: 'v4-ctl-04', cat: 'control', query: 'jericho road bike shop opening hours', expected: [] },
  { id: 'v4-ctl-05', cat: 'control', query: 'leviathan gaming laptop review and benchmarks', expected: [] },
  { id: 'v4-ctl-06', cat: 'control', query: 'how to bake sourdough bread without a starter', expected: [] },
  { id: 'v4-ctl-07', cat: 'control', query: 'used pickup trucks for sale under ten thousand dollars', expected: [] },
  { id: 'v4-ctl-08', cat: 'control', query: 'the resurrection of vinyl records among young collectors', expected: [] },
  { id: 'v4-ctl-09', cat: 'control', query: 'my kingdom for a decent cup of coffee this morning', expected: [] },
  { id: 'v4-ctl-10', cat: 'control', query: 'red sea diving resorts and liveaboard trips in Egypt', expected: [] },
];

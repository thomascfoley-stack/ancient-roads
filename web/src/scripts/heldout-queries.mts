// Held-out launch-gate eval — query sets (docs/HELDOUT_EVAL_DESIGN.md).
//
// `expected` is a list of reference STRINGS resolved through the tested ref-parse
// (no hand-coded book numbers). Topical/epistle expected sets are seeded from the
// public-domain Westminster Shorter (WSC) + Heidelberg (HC) catechism proof-texts —
// the "right passages" are a centuries-old published authority's call, not ours.
// Controls have expected = [] (PASS = no floor hijack / honest empty).
//
// PILOT is a SEPARATE ~20-query plumbing set to validate the harness. The frozen
// 120 is authored + hashed independently and is NOT derived from pilot results.

export type Cat = 'verse-ref' | 'pericope' | 'epistle' | 'topical' | 'proper-noun' | 'control';

export interface Q {
  id: string;
  cat: Cat;
  query: string;
  expected: string[]; // reference strings; [] for controls
  source?: string; // e.g. "WSC Q33" — provenance of the label
  notes?: string;
}

// ~20-query plumbing pilot. Spans every category so the harness's labeling,
// failure-coding, and shared routing path are all exercised. Disjoint from the 88.
export const PILOT: Q[] = [
  // verse-ref (stratified, not from the 88)
  { id: 'p-vr-1', cat: 'verse-ref', query: 'Nahum 1, the LORD is slow to anger but great in power', expected: ['Nahum 1'] },
  { id: 'p-vr-2', cat: 'verse-ref', query: '2 Samuel 12, Nathan confronts David with the parable of the ewe lamb', expected: ['2 Samuel 12'] },
  { id: 'p-vr-3', cat: 'verse-ref', query: 'Ecclesiastes 3, to everything there is a season', expected: ['Ecclesiastes 3'] },
  { id: 'p-vr-4', cat: 'verse-ref', query: 'Malachi 3, will a man rob God', expected: ['Malachi 3'] },
  // pericopes NOT in the gazetteer (generalization)
  { id: 'p-pc-1', cat: 'pericope', query: 'Nicodemus visits Jesus by night', expected: ['John 3'], notes: 'not in gazetteer' },
  { id: 'p-pc-2', cat: 'pericope', query: 'the woman at the well in Samaria', expected: ['John 4'], notes: 'not in gazetteer' },
  { id: 'p-pc-3', cat: 'pericope', query: 'the parable of the sower and the seed', expected: ['Matthew 13', 'Mark 4', 'Luke 8'], notes: 'not in gazetteer' },
  // epistle-topic (catechism proof-texts)
  { id: 'p-ep-1', cat: 'epistle', query: 'what is justification by faith', expected: ['Romans 3', 'Romans 4', 'Romans 5', '2 Corinthians 5', 'Galatians 2'], source: 'WSC Q33' },
  { id: 'p-ep-2', cat: 'epistle', query: 'the doctrine of adoption as sons of God', expected: ['1 John 3', 'John 1', 'Romans 8', 'Galatians 4', 'Ephesians 1'], source: 'WSC Q34' },
  { id: 'p-ep-3', cat: 'epistle', query: 'propitiation for sins through the blood of Christ', expected: ['Romans 3', '1 John 2', '1 John 4', 'Hebrews 2'], source: 'HC LD 5-6' },
  { id: 'p-ep-4', cat: 'epistle', query: 'sanctification and growing in holiness', expected: ['2 Thessalonians 2', 'Ephesians 4', 'Romans 6'], source: 'WSC Q35' },
  // general topical (catechism proof-texts)
  { id: 'p-tp-1', cat: 'topical', query: "God's providence governing all his creatures", expected: ['Psalm 145', 'Matthew 10', 'Romans 8', 'Ephesians 1'], source: 'WSC Q11' },
  { id: 'p-tp-2', cat: 'topical', query: 'the sum of the moral law, love God and neighbor', expected: ['Matthew 22', 'Romans 13', 'Exodus 20', 'Deuteronomy 5'], source: 'WSC Q41-42' },
  { id: 'p-tp-3', cat: 'topical', query: 'comfort in suffering and affliction', expected: ['Romans 8', '2 Corinthians 1', 'Psalm 34'], source: 'HC LD 1' },
  // proper-noun / rare
  { id: 'p-pn-1', cat: 'proper-noun', query: 'Melchizedek, king of Salem and priest of God Most High', expected: ['Genesis 14', 'Psalm 110', 'Hebrews 7'] },
  { id: 'p-pn-2', cat: 'proper-noun', query: 'Onesimus the runaway slave in Paul’s letter', expected: ['Philemon 1', 'Colossians 4'] },
  { id: 'p-pn-3', cat: 'proper-noun', query: 'the Nephilim, giants in the earth in those days', expected: ['Genesis 6'] },
  // negative controls (PASS = no floor hijack)
  { id: 'p-ctl-1', cat: 'control', query: 'good shepherd insurance company reviews', expected: [] },
  { id: 'p-ctl-2', cat: 'control', query: 'the fiery furnace at the steel foundry', expected: [] },
  { id: 'p-ctl-3', cat: 'control', query: 'how do I set up a python virtual environment', expected: [] },
];

// ── FROZEN launch-gate set (120). Authored + hashed before any accuracy number.
// Disjoint from the tuned 88. Topical/epistle labels = WSC/HC catechism proof-texts.
export const FROZEN: Q[] = [
  // ── Canon-coverage verse-ref (40) — stratified across the canon ──
  { id: 'f-vr-01', cat: 'verse-ref', query: 'Genesis 22, the binding of Isaac on Mount Moriah', expected: ['Genesis 22'] },
  { id: 'f-vr-02', cat: 'verse-ref', query: 'Exodus 14, the parting of the Red Sea', expected: ['Exodus 14'] },
  { id: 'f-vr-03', cat: 'verse-ref', query: 'Leviticus 16, the Day of Atonement and the scapegoat', expected: ['Leviticus 16'] },
  { id: 'f-vr-04', cat: 'verse-ref', query: 'Numbers 21, the bronze serpent lifted up in the wilderness', expected: ['Numbers 21'] },
  { id: 'f-vr-05', cat: 'verse-ref', query: 'Deuteronomy 6, hear O Israel the LORD our God is one', expected: ['Deuteronomy 6'] },
  { id: 'f-vr-06', cat: 'verse-ref', query: 'Joshua 6, the walls of Jericho fall down', expected: ['Joshua 6'] },
  { id: 'f-vr-07', cat: 'verse-ref', query: 'Judges 7, Gideon and the three hundred men', expected: ['Judges 7'] },
  { id: 'f-vr-08', cat: 'verse-ref', query: 'Ruth 1, where you go I will go, your God my God', expected: ['Ruth 1'] },
  { id: 'f-vr-09', cat: 'verse-ref', query: '1 Samuel 3, the LORD calls the boy Samuel in the night', expected: ['1 Samuel 3'] },
  { id: 'f-vr-10', cat: 'verse-ref', query: '1 Kings 3, Solomon asks God for wisdom', expected: ['1 Kings 3'] },
  { id: 'f-vr-11', cat: 'verse-ref', query: '2 Kings 2, Elijah taken up by a whirlwind into heaven', expected: ['2 Kings 2'] },
  { id: 'f-vr-12', cat: 'verse-ref', query: 'Nehemiah 8, Ezra reads the Book of the Law to the people', expected: ['Nehemiah 8'] },
  { id: 'f-vr-13', cat: 'verse-ref', query: 'Job 38, where were you when I laid the foundations of the earth', expected: ['Job 38'] },
  { id: 'f-vr-14', cat: 'verse-ref', query: 'Psalm 51, create in me a clean heart O God', expected: ['Psalm 51'] },
  { id: 'f-vr-15', cat: 'verse-ref', query: 'Psalm 139, you have searched me and known me', expected: ['Psalm 139'] },
  { id: 'f-vr-16', cat: 'verse-ref', query: 'Proverbs 8, wisdom calling aloud in the streets', expected: ['Proverbs 8'] },
  { id: 'f-vr-17', cat: 'verse-ref', query: 'Isaiah 6, holy holy holy is the LORD of hosts', expected: ['Isaiah 6'] },
  { id: 'f-vr-18', cat: 'verse-ref', query: 'Isaiah 40, comfort comfort my people says your God', expected: ['Isaiah 40'] },
  { id: 'f-vr-19', cat: 'verse-ref', query: 'Jeremiah 31, I will make a new covenant with the house of Israel', expected: ['Jeremiah 31'] },
  { id: 'f-vr-20', cat: 'verse-ref', query: 'Ezekiel 1, the vision of the wheels and the living creatures', expected: ['Ezekiel 1'] },
  { id: 'f-vr-21', cat: 'verse-ref', query: 'Lamentations 3, his mercies are new every morning', expected: ['Lamentations 3'] },
  { id: 'f-vr-22', cat: 'verse-ref', query: 'Daniel 2, the statue of gold silver bronze and iron', expected: ['Daniel 2'] },
  { id: 'f-vr-23', cat: 'verse-ref', query: 'Hosea 11, when Israel was a child I loved him', expected: ['Hosea 11'] },
  { id: 'f-vr-24', cat: 'verse-ref', query: 'Joel 2, I will pour out my Spirit on all flesh', expected: ['Joel 2'] },
  { id: 'f-vr-25', cat: 'verse-ref', query: 'Amos 7, the LORD standing with a plumb line', expected: ['Amos 7'] },
  { id: 'f-vr-26', cat: 'verse-ref', query: 'Micah 6, do justice love mercy walk humbly with your God', expected: ['Micah 6'] },
  { id: 'f-vr-27', cat: 'verse-ref', query: 'Habakkuk 2, the righteous shall live by his faith', expected: ['Habakkuk 2'] },
  { id: 'f-vr-28', cat: 'verse-ref', query: 'Zechariah 9, your king comes to you humble riding on a donkey', expected: ['Zechariah 9'] },
  { id: 'f-vr-29', cat: 'verse-ref', query: 'Matthew 25, the sheep and the goats at the final judgment', expected: ['Matthew 25'] },
  { id: 'f-vr-30', cat: 'verse-ref', query: 'Luke 2, the shepherds and the angels at Bethlehem', expected: ['Luke 2'] },
  { id: 'f-vr-31', cat: 'verse-ref', query: 'John 21, Jesus restores Peter, feed my sheep', expected: ['John 21'] },
  { id: 'f-vr-32', cat: 'verse-ref', query: 'Acts 2, Peter preaches at Pentecost', expected: ['Acts 2'] },
  { id: 'f-vr-33', cat: 'verse-ref', query: 'Romans 12, present your bodies as a living sacrifice', expected: ['Romans 12'] },
  { id: 'f-vr-34', cat: 'verse-ref', query: '1 Corinthians 15, if Christ has not been raised our faith is vain', expected: ['1 Corinthians 15'] },
  { id: 'f-vr-35', cat: 'verse-ref', query: '2 Corinthians 12, my grace is sufficient for you, thorn in the flesh', expected: ['2 Corinthians 12'] },
  { id: 'f-vr-36', cat: 'verse-ref', query: 'Philippians 4, rejoice in the Lord always, be anxious for nothing', expected: ['Philippians 4'] },
  { id: 'f-vr-37', cat: 'verse-ref', query: 'Colossians 1, Christ the firstborn over all creation', expected: ['Colossians 1'] },
  { id: 'f-vr-38', cat: 'verse-ref', query: 'Hebrews 11, faith is the assurance of things hoped for', expected: ['Hebrews 11'] },
  { id: 'f-vr-39', cat: 'verse-ref', query: 'James 1, count it all joy when you meet trials', expected: ['James 1'] },
  { id: 'f-vr-40', cat: 'verse-ref', query: 'Revelation 5, worthy is the Lamb who was slain', expected: ['Revelation 5'] },

  // ── Held-out pericopes (15) — mix of not-in-gazetteer + gazetteer freshly phrased ──
  { id: 'f-pc-01', cat: 'pericope', query: "Jacob's ladder, the dream of angels at Bethel", expected: ['Genesis 28'], notes: 'not in gazetteer' },
  { id: 'f-pc-02', cat: 'pericope', query: 'the three visitors to Abraham at the oaks of Mamre', expected: ['Genesis 18'], notes: 'not in gazetteer' },
  { id: 'f-pc-03', cat: 'pericope', query: "Balaam's donkey speaks with a human voice", expected: ['Numbers 22'], notes: 'not in gazetteer' },
  { id: 'f-pc-04', cat: 'pericope', query: 'Elijah and the still small voice at Horeb', expected: ['1 Kings 19'], notes: 'not in gazetteer' },
  { id: 'f-pc-05', cat: 'pericope', query: 'Jonah swallowed by the great fish', expected: ['Jonah 1', 'Jonah 2'], notes: 'not in gazetteer' },
  { id: 'f-pc-06', cat: 'pericope', query: 'Cain and Abel and the first murder', expected: ['Genesis 4'], notes: 'not in gazetteer' },
  { id: 'f-pc-07', cat: 'pericope', query: 'Zacchaeus the tax collector climbs the sycamore tree', expected: ['Luke 19'], notes: 'not in gazetteer' },
  { id: 'f-pc-08', cat: 'pericope', query: 'Joseph sold into slavery by his brothers', expected: ['Genesis 37'], notes: 'not in gazetteer' },
  { id: 'f-pc-09', cat: 'pericope', query: 'Hannah prays for a son and dedicates Samuel', expected: ['1 Samuel 1'], notes: 'not in gazetteer' },
  { id: 'f-pc-10', cat: 'pericope', query: 'Samuel anoints David as king over Israel', expected: ['1 Samuel 16'], notes: 'not in gazetteer' },
  { id: 'f-pc-11', cat: 'pericope', query: 'the parable of the lost son who returns home', expected: ['Luke 15'], notes: 'gazetteer, fresh phrasing' },
  { id: 'f-pc-12', cat: 'pericope', query: 'putting on the whole armour of God against the powers of darkness', expected: ['Ephesians 6'], notes: 'gazetteer, fresh phrasing' },
  { id: 'f-pc-13', cat: 'pericope', query: 'Christ the true vine, abide in me and bear fruit', expected: ['John 15'], notes: 'gazetteer, fresh phrasing' },
  { id: 'f-pc-14', cat: 'pericope', query: 'the Samaritan who bound up the wounded traveler', expected: ['Luke 10'], notes: 'gazetteer, fresh phrasing' },
  { id: 'f-pc-15', cat: 'pericope', query: 'the transfiguration of Jesus on the high mountain', expected: ['Matthew 17', 'Mark 9', 'Luke 9'], notes: 'gazetteer, fresh phrasing' },

  // ── Epistle-topic (25) — labels re-derived from authoritative WSC/HC proof-texts
  // (v2 re-freeze). Locus = doctrine's defining texts where no single catechism Q maps. ──
  { id: 'f-ep-01', cat: 'epistle', query: 'effectual calling by the Word and Spirit', expected: ['2 Timothy 1', '2 Thessalonians 2', 'Acts 2', 'Acts 26', 'Ezekiel 36', 'John 6', 'Philippians 2'], source: 'WSC Q31' },
  { id: 'f-ep-02', cat: 'epistle', query: 'regeneration, born again by the Spirit', expected: ['John 3', 'Titus 3', 'Ezekiel 36', 'Ephesians 2', '1 Peter 1'], source: 'WSC Q31 + locus' },
  { id: 'f-ep-03', cat: 'epistle', query: 'union with Christ, in him and he in us', expected: ['John 15', 'Romans 6', 'Galatians 2', 'Ephesians 1', '1 Corinthians 6', 'Colossians 1'], source: 'WCF 26 locus' },
  { id: 'f-ep-04', cat: 'epistle', query: 'redemption through the blood of Christ', expected: ['Ephesians 1', 'Colossians 1', '1 Peter 1', 'Hebrews 9', '1 John 1'], source: 'HC LD1 + locus' },
  { id: 'f-ep-05', cat: 'epistle', query: 'reconciliation with God through Christ', expected: ['2 Corinthians 5', 'Romans 5', 'Colossians 1', 'Ephesians 2'], source: 'WSC Q33 + locus' },
  { id: 'f-ep-06', cat: 'epistle', query: 'the imputation of the righteousness of Christ', expected: ['Romans 3', 'Romans 4', '2 Corinthians 5', 'Romans 5', 'Galatians 2', 'Philippians 3'], source: 'WSC Q33' },
  { id: 'f-ep-07', cat: 'epistle', query: 'election and predestination unto salvation', expected: ['Ephesians 1', 'Romans 9', 'Romans 8', '2 Thessalonians 2'], source: 'WSC Q7 + locus' },
  { id: 'f-ep-08', cat: 'epistle', query: 'the perseverance of the saints, kept by God', expected: ['John 10', '2 Thessalonians 3', '1 Peter 1', 'John 6', 'Romans 8', 'Philippians 1'], source: 'HC LD1 + locus' },
  { id: 'f-ep-09', cat: 'epistle', query: 'assurance of salvation and the witness of the Spirit', expected: ['Romans 5', 'Romans 14', 'Proverbs 4', '1 John 5', '1 Peter 1'], source: 'WSC Q36' },
  { id: 'f-ep-10', cat: 'epistle', query: 'walking by the Spirit and not the flesh', expected: ['Galatians 5', 'Romans 8', 'Romans 6', 'Ephesians 4'], source: 'WSC Q35 + HC LD33' },
  { id: 'f-ep-11', cat: 'epistle', query: 'faith versus works and the example of Abraham', expected: ['Romans 4', 'James 2', 'Galatians 3', 'Hebrews 11'], source: 'locus (Abraham)' },
  { id: 'f-ep-12', cat: 'epistle', query: 'the law as a schoolmaster leading us to Christ', expected: ['Galatians 3', 'Romans 7', 'Romans 10', 'Romans 3'], source: 'WSC Q40 + locus' },
  { id: 'f-ep-13', cat: 'epistle', query: 'dying and rising with Christ in baptism', expected: ['Romans 6', 'Colossians 2', '1 Peter 3'], source: 'HC LD26' },
  { id: 'f-ep-14', cat: 'epistle', query: 'Christ our high priest forever', expected: ['Hebrews 2', 'Hebrews 7', 'Hebrews 9'], source: 'WSC Q25 (strict)' },
  { id: 'f-ep-15', cat: 'epistle', query: 'Christ the one mediator between God and men', expected: ['1 Timothy 2', 'Hebrews 7', '1 Peter 3', 'John 3', 'Acts 20'], source: 'HC LD6 + 1 Tim 2' },
  { id: 'f-ep-16', cat: 'epistle', query: 'the second coming and the day of the Lord', expected: ['1 Thessalonians 4', '2 Thessalonians 1', 'Matthew 25', '2 Peter 3', 'Titus 2'], source: 'HC LD19 + locus' },
  { id: 'f-ep-17', cat: 'epistle', query: 'the resurrection of the body at the last day', expected: ['1 Corinthians 15', '1 Thessalonians 4', 'Philippians 3', '1 John 3', 'Job 19'], source: 'WSC Q38 + HC LD22' },
  { id: 'f-ep-18', cat: 'epistle', query: 'salvation by grace and not by law', expected: ['Ephesians 2', 'Romans 11', 'Titus 2', 'Romans 3'], source: 'locus' },
  { id: 'f-ep-19', cat: 'epistle', query: 'the indwelling of the Holy Spirit in believers', expected: ['Romans 8', '1 Corinthians 6', 'Ephesians 1', 'John 14', '1 Corinthians 3'], source: 'HC LD20' },
  { id: 'f-ep-20', cat: 'epistle', query: 'spiritual gifts and the one body of Christ', expected: ['1 Corinthians 12', 'Romans 12', 'Ephesians 4'], source: 'HC LD21' },
  { id: 'f-ep-21', cat: 'epistle', query: 'the peace of God that surpasses understanding', expected: ['Philippians 4', 'Colossians 3', 'Romans 5', 'John 14', 'Romans 15'], source: 'HC LD1 + locus' },
  { id: 'f-ep-22', cat: 'epistle', query: 'putting off the old self and putting on the new', expected: ['Ephesians 4', 'Colossians 3', 'Romans 6'], source: 'HC LD33' },
  { id: 'f-ep-23', cat: 'epistle', query: "God's love in Christ dying for sinners", expected: ['Romans 5', '1 John 4', 'John 3'], source: 'HC LD6 + locus' },
  { id: 'f-ep-24', cat: 'epistle', query: 'the wages of sin and the free gift of God', expected: ['Romans 6', 'Romans 5', 'Galatians 3', 'Ephesians 5'], source: 'WSC Q84 + Rom 6:23' },
  { id: 'f-ep-25', cat: 'epistle', query: 'glorification, conformed to the image of Christ', expected: ['Romans 8', '1 John 3', 'Philippians 3', '1 Corinthians 15'], source: 'WSC Q38 + locus' },

  // ── General topical (20) — labels re-derived from authoritative WSC/HC proof-texts
  // (v2 re-freeze); locus = defining texts where no catechism Q maps. f-tp-06 fixes the
  // Gen 1 error (WSC Q10 cites Gen 1:26-28). ──
  { id: 'f-tp-01', cat: 'topical', query: 'the sovereignty of God over the nations', expected: ['Psalm 148', 'Isaiah 40', 'Daniel 4', 'Acts 4', 'Revelation 4', 'Psalm 47', 'Isaiah 46'], source: 'WSC Q8 + locus' },
  { id: 'f-tp-02', cat: 'topical', query: 'the fear of the LORD is the beginning of wisdom', expected: ['Proverbs 1', 'Proverbs 9', 'Psalm 111'], source: 'locus' },
  { id: 'f-tp-03', cat: 'topical', query: 'repentance and turning from sin to God', expected: ['Acts 11', 'Acts 2', 'Joel 2', 'Jeremiah 3', 'Jeremiah 31', 'Ezekiel 36', '2 Corinthians 7', 'Isaiah 1'], source: 'WSC Q87' },
  { id: 'f-tp-04', cat: 'topical', query: 'how we ought to pray to God', expected: ['Psalm 62', '1 John 5', 'John 16', 'Psalm 32', 'Daniel 9', 'Philippians 4'], source: 'WSC Q98' },
  { id: 'f-tp-05', cat: 'topical', query: 'the forgiveness of sins', expected: ['Psalm 32', '1 John 1', 'Colossians 2', 'Jeremiah 31', 'Psalm 103'], source: 'HC LD21 + locus' },
  { id: 'f-tp-06', cat: 'topical', query: 'humanity made in the image of God', expected: ['Genesis 1', 'Colossians 3', 'Ephesians 4'], source: 'WSC Q10' },
  { id: 'f-tp-07', cat: 'topical', query: 'the covenant God made with Abraham', expected: ['Genesis 12', 'Genesis 15', 'Genesis 17', 'Galatians 3'], source: 'WCF 7 locus' },
  { id: 'f-tp-08', cat: 'topical', query: 'the faithfulness and steadfast love of God', expected: ['Lamentations 3', 'Psalm 136', 'Deuteronomy 7', 'Exodus 34', 'Psalm 89'], source: 'WSC Q4 + locus' },
  { id: 'f-tp-09', cat: 'topical', query: 'the kingdom of God is at hand', expected: ['Mark 1', 'Matthew 4', 'Matthew 13', 'Luke 17'], source: 'locus' },
  { id: 'f-tp-10', cat: 'topical', query: 'idolatry and the worship of false gods', expected: ['Exodus 20', 'Deuteronomy 4', 'Isaiah 44', '1 Corinthians 10', 'Romans 1', 'Ezekiel 8'], source: 'WSC Q48-51 + locus' },
  { id: 'f-tp-11', cat: 'topical', query: 'humility and the danger of pride', expected: ['Proverbs 16', 'James 4', '1 Peter 5', 'Philippians 2'], source: 'locus' },
  { id: 'f-tp-12', cat: 'topical', query: 'the tongue and the power of words', expected: ['James 3', 'Proverbs 18', 'Ephesians 4', 'Matthew 12'], source: 'locus' },
  { id: 'f-tp-13', cat: 'topical', query: 'money, wealth, and the love of it', expected: ['1 Timothy 6', 'Matthew 6', 'Proverbs 30', 'Luke 12'], source: 'locus' },
  { id: 'f-tp-14', cat: 'topical', query: 'marriage and the union of husband and wife', expected: ['Genesis 2', 'Ephesians 5', 'Matthew 19', '1 Corinthians 7', '1 Peter 3'], source: 'WSC Q71 + locus' },
  { id: 'f-tp-15', cat: 'topical', query: 'the last judgment before God', expected: ['Revelation 20', 'Matthew 25', '2 Corinthians 5', '2 Thessalonians 1', '1 Peter 4'], source: 'HC LD19 + locus' },
  { id: 'f-tp-16', cat: 'topical', query: 'the hope of eternal life', expected: ['John 17', '1 John 5', 'Titus 1', 'John 10'], source: 'HC LD22' },
  { id: 'f-tp-17', cat: 'topical', query: 'angels and their ministry to the saints', expected: ['Hebrews 1', 'Psalm 91', 'Luke 1', 'Psalm 103'], source: 'locus' },
  { id: 'f-tp-18', cat: 'topical', query: 'creation declaring the glory of God', expected: ['Psalm 104', 'Romans 1', 'Acts 14', 'Psalm 19'], source: 'locus' },
  { id: 'f-tp-19', cat: 'topical', query: 'suffering and the patience of Job', expected: ['Job 1', 'Job 2', 'James 5', 'Romans 5'], source: 'locus (Jas 5:11)' },
  { id: 'f-tp-20', cat: 'topical', query: 'worship in spirit and in truth', expected: ['John 4', 'Psalm 95', 'Romans 12', 'Psalm 29'], source: 'locus' },

  // ── Proper-noun / rare (10) ──
  { id: 'f-pn-01', cat: 'proper-noun', query: 'Rahab the harlot who hid the spies at Jericho', expected: ['Joshua 2', 'Hebrews 11', 'James 2'] },
  { id: 'f-pn-02', cat: 'proper-noun', query: 'Barnabas the son of encouragement', expected: ['Acts 4', 'Acts 11', 'Acts 13'] },
  { id: 'f-pn-03', cat: 'proper-noun', query: 'Cornelius the centurion who feared God', expected: ['Acts 10'] },
  { id: 'f-pn-04', cat: 'proper-noun', query: 'Lydia the seller of purple at Philippi', expected: ['Acts 16'] },
  { id: 'f-pn-05', cat: 'proper-noun', query: 'the Urim and Thummim on the priest breastplate', expected: ['Exodus 28', 'Leviticus 8', 'Numbers 27'] },
  { id: 'f-pn-06', cat: 'proper-noun', query: 'the Nazirite vow and its requirements', expected: ['Numbers 6', 'Judges 13'] },
  { id: 'f-pn-07', cat: 'proper-noun', query: 'the birthright and Esau who despised it', expected: ['Genesis 25', 'Genesis 27', 'Hebrews 12'] },
  { id: 'f-pn-08', cat: 'proper-noun', query: 'leviathan and behemoth in the book of Job', expected: ['Job 40', 'Job 41'] },
  { id: 'f-pn-09', cat: 'proper-noun', query: 'the ephod and the garments of the priesthood', expected: ['Exodus 28', 'Exodus 39'] },
  { id: 'f-pn-10', cat: 'proper-noun', query: 'Gog and Magog and the final battle', expected: ['Ezekiel 38', 'Ezekiel 39', 'Revelation 20'] },

  // ── Negative controls (10) — idiomatic (no hijack) + out-of-corpus (honest empty) ──
  { id: 'f-ctl-01', cat: 'control', query: 'the good samaritan food truck menu downtown', expected: [] },
  { id: 'f-ctl-02', cat: 'control', query: 'walking on water paddleboard rentals', expected: [] },
  { id: 'f-ctl-03', cat: 'control', query: 'bread of life gluten free recipes', expected: [] },
  { id: 'f-ctl-04', cat: 'control', query: 'prodigal son wine bar happy hour specials', expected: [] },
  { id: 'f-ctl-05', cat: 'control', query: 'armor of god youth group t-shirt designs', expected: [] },
  { id: 'f-ctl-06', cat: 'control', query: 'how to reset my wifi router password', expected: [] },
  { id: 'f-ctl-07', cat: 'control', query: 'best hiking trails near Denver Colorado', expected: [] },
  { id: 'f-ctl-08', cat: 'control', query: 'the genesis of the automobile industry', expected: [] },
  { id: 'f-ctl-09', cat: 'control', query: 'exodus from the crowded stadium after the game', expected: [] },
  { id: 'f-ctl-10', cat: 'control', query: 'a revelation about my career path', expected: [] },
];

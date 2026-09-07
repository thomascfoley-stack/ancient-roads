// ADR-029 Track A (2026-09-06 order): the detector learns addendum 2's two missing shapes —
// publisher catalogues/price lists and machine-generated word/phrase indexes — plus a
// head-AND-tail per-work sweep with author-aware foreign-matter signals (work banners and
// bylines naming someone other than the declared author: the Origen/Clement class).
//
// Every positive fixture below is REAL TEXT: the exact suppressed bodies from
// docs/evidence/part1+part2 (the addendum-2 backup), live dev sections for the kept
// negatives, and the Project Gutenberg #42518 source for the mixed chunk §298. The bar and
// the store-backed run live in docs/evidence/adr029-scan-2026-09-06/redproof.log.
import { describe, expect, it } from 'vitest';
import * as det from '../scripts/lib/front-matter-detector.mjs';

const { frontMatterVerdict } = det as any;
const foreignMatterVerdict: any = (det as any).foreignMatterVerdict;
const sweepWorkMatter: any = (det as any).sweepWorkMatter;

// ── real fixtures ────────────────────────────────────────────────────────────
const OWEN_WORD_INDEX = { heading: "Latin Words and Phrases", body: "Index of Latin Words and Phrases Adhuc sub judice lis est:\n1\nArmorum superi, tuque \u00f4 qui funere tanto:\n1\nCertatur:\n1\nCommunis et orthodoxa (ut asseris) sententia est, Jesum Christum ideo servatorem nostrum esse, quia divin\u00e6 justiti\u00e6 per quam peccatores damnari merebamur, pro peccatis nostris plene satisfecerit; qu\u00e6 satisfactio, per fidem, imputatur nobis ex dono Dei credentibus.:\n1\nConspectus ab u" };
const SCHAFF_GERMAN_INDEX = { heading: 'German Words and Phrases', body: 'Index of German Words and Phrases\nAbgott:\n1\nAgnus Dei:\n2' };
const HEADLESS_INDEX = { body: 'Index of Latin Words and Phrases\n\na duo liberum est abstinere.:\n1\nad utrumque:\n1\n2\nstamina vitae:\n1' };

const TENNYSON_PRICE_LIST = { heading: "POETRY.", body: "_s._ _d._\nMILNES\u2019S POEMS OF MANY YEARS                                          5 0\n---- MEMORIALS OF MANY SCENES                                         5 0\n---- POEMS LEGENDARY AND HISTORICAL                                   5 0\n---- PALM LEAVES                                                      5 0\nTRENCH\u2019S JUSTIN MARTYR, and other Poems                               6 0\nBROWNING\u2019S SORDELLO                                                   6 6\nTAYLOR\u2019S EVE OF THE CONQUEST                                          3 6\nLANDOR\u2019S HELLENICS                                                    6 0\n(In 2 4mo.)\nROGERS\u2019S POETICAL WORKS                                               2 6\nCAMPBELL\u2019S POETICAL WORKS                                             2 6\nTALFOURD\u2019S (MR. JUSTICE) TRAGEDIES                                    2 6\nTAYLOR\u2019S PHILIP VAN ARTEVELDE                                         2 6\n---- EDWIN THE FAIR, &c." };
const TENNYSON_CHEAP_EDITIONS = { heading: "CHEAP EDITIONS OF POPULAR WORKS.", body: "_s._ _d._\nSHELLEY\u2019S ESSAYS AND LETTERS                                          5 0\nSEDGWICK\u2019S LETTERS FROM ABROAD                                        2 6\nDANA\u2019S TWO YEARS BEFORE THE MAST                                      2 6\nCLEVELAND\u2019S VOYAGES AND COMMERCIAL ENTERPRISES                        2 6\nELLIS\u2019S EMBASSY TO CHINA                                              2 6\nPRINGLE\u2019S RESIDENCE " };
const TRAHERNE_FORMAT_HEADING = { heading: "_Post 8vo, cloth extra, 6s.; or on hand-made paper, 12s._", body: "SIDELIGHTS ON CHARLES LAMB\nThis work contains much new matter relating to Charles Lamb, his\nworks and his friends. It comprises a number of essays, poems, and\nshort articles, some of which are certainly by Lamb, while others are\nprobably his. One of them, which is undoubtedly by Lamb, tells, under\nt" };
const TRAHERNE_PREPARING = { heading: "WORKS PREPARING FOR PUBLICATION", body: "_Cloth extra, 5s. net; large paper copies, 7s. 6d. net._\nCENTURIES OF MEDITATION\nBy THOMAS TRAHERNE\nTraherne is no less excellent as a prose writer than as a poet; indeed,\nI think it is not too much to say that his prose will bear comparison\nwith that of any English writer of the seventeenth century" };
const SPURGEON_AD_299 = { heading: "WHEAT IN THE BARN \u2014 MATTHEW 13:30 (14/15)", body: "I believe the prevention or destruction of unborn human life to be, par-excellence, the American sin, and that, if not checked, it will sooner or later be our calamity. This sin has its roots in a low and false idea of marriage on the part of some, and in others it is fostered by false standards of modesty.\" Chicago Journal says: \"To the earnest man and woman everywhere, who has watched the reckless manner in which marriages are contracted, the wicked way in which the responsibilities are shifted and ignored, and the slow and sure defilement of society because the criminal classes are allowed to propagate their vile species, while Christian households and moral parents ignore their duty to this and to the next world, this book is almost like a voice from heaven.\" A Man's Will. BY EDGAR FAWCETT. It presents pictures of New York life and shows the terribly degrading effects of drunkenness in the upper ranks of society. A temperance novel of surprising interest. 12mo, cloth, $1.50. The New York Press says: \"The best temperance story published in many years, if indeed its equal exists. The author, evidently conscious that his subject is one on which too much cannot be said, and well aware that the sufferings of alcoholic victims and all connected with them, are beyond description, has grappled with his work in deadly earnest. Old and young people ought to read and ponder over this good and brilliantly prepared study.\" _Funk & Wagnalls' Important Publications._ Life of John B. Finch. BY FRANCES E. FINCH and FRANK J. SIBLEY. Mr. Finch was Right Worthy Grand Templar of I. O. G. T. of the World. Will contain all his great temperance speeches. Introduction by Miss Frances E. Willard; articles by Mrs. Woodbridge, Prof. Hopkins, Senator Blair, etc., etc. Agents wanted." };
const SPURGEON_AD_300 = { heading: "WHEAT IN THE BARN \u2014 MATTHEW 13:30 (15/15)", body: "Numerous Illustrations. Steel Portrait. Cloth, crown 8vo, 500 pages. Price, $1.50. \"Good Templars will mourn his loss as irreparable.\"--_Gen. Clinton B. Fisk._ \"No man his equal as a speaker and organizer.\"--_Col. R. S. Cheves._ \"An able and sincere man.\"--_Ex-Gov. Hoadly of Ohio._ Prohibition Bells, And SONGS OF THE NEW CRUSADE. Compiled by the famous SILVER LAKE QUARTETTE. Stirring words put to catchy music. Second edition. Paper, 20 cents; board, 30 cents. Special rates on large quantities. \"These bells are not muffled; they give out no uncertain sound. The fifty-two notes are clear, high, piercing, pulse-quickening, soul-uplifting; yet to the old parties, doubtless, very discordant. They will be heard throughout the land, for they call to better, purer living, both by the individual and the State. The book cannot but be a _vade-mecum_ to every Prohibitionist organization, be it large or small, for a song often wins a vote when an oration fails; and then how tame is a campaign without music!\" The Supreme Court Decision. The Great Prohibition Decision announced by the Supreme Court of the United States. With Introductions and annotations kindly furnished by Hon. S. W. PACKARD of Chicago, Ill. 12mo, paper, 20 cents. Every Prohibitionist recognizes the extreme value of this pamphlet, as it gives the conclusive testimony of the highest courts as to the legality of Prohibition laws. End of Project Gutenberg's Talks To Farmers, by Charles Haddon Spurgeon" };
// The MIXED chunk, verbatim from PG #42518 between the start of "Is the eternal happiness…"
// and the start of §299's known opening. Addendum 2 KEPT it: real Spurgeon, flagged for a
// re-slice — a detector finding here is a false positive.
const SPURGEON_MIXED_298 = { heading: 'WHEAT IN THE BARN — MATTHEW 13:30 (13/15)', body: "Is the eternal happiness of the righteous the birth which comes of their death-pangs? Then happy are they who die. Is glory the end and outcome of that which fills our home with mourning? If so, thank God for bereavements; thank God for saddest severings. He has promoted our dear ones to the skies! He has blessed them beyond all that we could ask or even think; he has taken them out of this weary world to lie in his own bosom for ever. Blessed be his name if it were for nothing else but this. Would you keep your old father here, full of pain, and broken down with feebleness? Would you shut him out of glory? Would you detain your dear wife here with all her suffering? Would you hold back your husband from the crown immortal? Could you wish your child to descend to earth again from the bliss which now surrounds her? No, no. We wish to be going home ourselves to the heavenly Father's house and its many mansions; but concerning the departed we rejoice before the Lord as with the joy of harvest. \"Wherefore comfort one another with these words.\" _Funk & Wagnalls' Important Publications._ The Ethics of Marriage. BY H. S. POMEROY, M.D. Prefatory note by Thomas Addis Emmett, M.D., LL.D., and Introduction by Rev. J. T. Duryea, D.D., of Boston. With an appendix showing the laws of most of the States and Territories regarding certain forms of crime. 12mo, cloth, 190 pp. Price, $1.00. The Author says in the preface: \"The matters here treated have been on my heart for many years. Heart-sickening facts have come to my notice within the past few months, and I feel it my duty to send out this warning in regard to what I consider the first and greatest danger of our family and national life." };

const CALVIN_INDEX_OF_CHAPTERS = { heading: 'General Index of Chapters.', body: "GENERAL INDEX OF CHAPTERS. BOOK FIRST. OF THE KNOWLEDGE OF GOD THE CREATOR. Eighteen Chapters 1. Connection between the Knowledge of God and the Knowledge of Ourselves. Nature of the connection. 2. What it is to Know God. Tendency of this Knowledge. 3. The Human Mind naturally imbued with the Knowledge of God. 4. This Knowledge stifled or corrupted, ignorantly or maliciously. 5. The Knowledge of God displayed in the fabric and constant Government of the Universe. 6. The need of Scripture as a Guide and Teacher in coming to God as a Creator. 7. The Testimony of the Spirit necessary to give full authority to Scripture. The impiety of pretending that the Credibility of Scripture depends on the Judgment of the Church. 8. The Credibility of Scripture sufficiently proved, in so far as Natural Reason admits. 9. All the principles of piety subverted by fanatics who substitute revelations for Scripture. 10. In Scripture, the true God opposed, exclusively, to all the gods of the Heathen. 11. Impiety of attributing a visible form to God. The setting up of Idols a revolt against the True God. 12.\n" };
const SCHAFF_COMPARATIVE_TABLE = { heading: "Comparative Table of the Ante-Nicene Rules of Faith as related to the Apostles' Creed and the Nicene Creed.", body: "COMPARATIVE TABLE OF THE ANTE-NICENE RULES OF FAITH, AS RELATED TO THE APOSTLES' CREED AND\nTHE N\u0399CENE CREED. The Apostles'\nCreed. (Rome.) About A.D. 340. Later additions are in italics . Iren\u00e6us. (Gaul.) A.D. 170. Tertullian. (North Africa.) A.D. 200. Cyprian. (Carthage.) A.D. 250. Novatian. (Rome.) A.D. 250. Origen. (Alexandria.) A.D. 230. I believe We believe We believe I believe We believe (We believe in) 1. in\nGod the Father Almighty, Maker\nof heaven and earth; 1. \u2026 in\none God the Father Almighty, who\nmade heaven and earth, and the sea, and all all that in them is; 1. \u2026 in\none God , the Creator of the world,\nwho produced all out of nothing \u2026 1. in\nGod the Father ; 1. in\nGod the Father and Almighty Lord; 1. One God , who created and framed\neverything \u2026 Who in the last days sent 2. and in\nJesus Christ, His only Son, our Lord; 2. And in one\nChrist Jesus , the Son of God [our\nLord]; 2. And in the Word, his Son,\nJesus Christ; 2. in his\nSon Christ; 2. in the Son of God,\nChrist Jesus, our Lord God; 2. Our Lord\nJesus Christ \u2026 born of the\nFather before all creation \u2026 3.\n" };
const SERMON_OPENING = { heading: 'WHEAT IN THE BARN — MATTHEW 13:30', body: "\"GATHER the wheat into my barn.\" Then the purpose of the Son of man will\nbe accomplished. He sowed good seed, and he shall have his barn filled\nwith it at the last. Be not dispirited, Christ will not be disappointed.\n\"He shall see of the travail of his soul, and shall be satisfied.\" He\nwent forth weeping, bearing precious seed, but he shall come again\nrejoicing, bringing his sheaves with him.\n\"Gather the wheat into my barn;\" then Satan's policy will be\nunsuccessful. The enemy came and sowed tares among the wheat, hopeful\nthat the false wheat would destroy or materially injure the true; but he\nfailed in the end, for the wheat ripened and was ready to be gathered.\nChrist's garner shall be fil" };

const ORIGEN_HEAD_CLEMENT = { heading: "The Salutation. Praise of the Corinthians Before the Breaking Forth of Schism Among Them.", body: "The First\nEpistle of Clement to the Corinthians. \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\nChapter I.\u2014The Salutation. Praise of the Corinthians Before the Breaking Forth of Schism Among\nThem. The church of God which sojourns\nat Rome, to the church of God sojourning at Corinth, to them that are\ncalled and sanctified by the will of God, through our Lord Jesus\nChrist:\u00a0 Grace unto you, and peace, from Almighty God through\nJesus Christ, be multiplied. Owing, dear brethren, to the sudden and successive\ncalamitous events which have happened\nto ourselves, we feel that we have been somewhat tardy in turning our\nattention to the points respecting which you consulted us; and\nespecially to that shameful and detestable sedition, utterly abhorrent\nto the elect of God, which a few rash and self-confident persons have\nkindled to such a pitch of frenzy, that your venerable and illustrious\nname, worthy to be universally loved, has suffered grievous\ninjury. For who ever\ndwelt even for a short time among you, and did not find your faith to\nbe as fruitful of virtue as it was firmly established?\n" };
const ORIGEN_GENUINE = { heading: 'How Christians are the Spiritual Israel.', body: "Origen\u2019s Commentary on the Gospel of John. \u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\u2014\nBook I. 1. How Christians are the\nSpiritual Israel. That people which was called of old the people of God\nwas divided into twelve tribes, and over and above the other tribes it\nhad the levitical order, which itself again carried on the service of\nGod in various priestly and levitical suborders. In the same\nmanner, it appears to me that the whole people of Christ, when we\nregard it in the aspect of the hidden man of the heart, that people which is called \u201cJew\ninwardly,\u201d and is circumcised in the spirit, has in a more mystic\nway the characteristics of the tribes. This may be more plainly\ngathered from John in his Apocalyse, though the other prophets also do\nnot by any means conceal the state of matters from those who have the\nfaculty of hearing them. John speaks as follows: \u00a0 \u201cAnd I saw another angel\nascending from the sunrising, having the seal of the living God, and he\ncried with a loud voice to the four angels to whom it was given to hurt\nthe earth and the sea, saying, Hurt not either the earth, or the sea,\nor the trees, till we have sealed the servants of our God on their\nforeheads.\n" };
const TRAHERNE_BYLINE = { heading: "_16mo, cloth, 3s. 6d._", body: "THE CITY OF DREADFUL NIGHT AND OTHER POEMS (Selected)\nBy JAMES THOMSON (\"B.V.\")\n[Illustration]" };
const CHRYSOSTOM_PROLEGOMENA_HEAD = { body: "Literature. Prolegomena. __________ The Life and Work of St. John Chrysostom. By Philip Schaff. Chapter I .\u2014 Literature . i. editions of chrysostom\u2019s\nworks. S. Joannis\nChrysostomi , archiepiscopi Constantinopolitani,\nOpera omnia qu\u00e6 exstant vel qu\u00e6 ejus nomine circumferuntur, ad\nmss. codices Gallicos, Vaticanos,\nAnglicos, Germanicosque castigata, etc. Opera et studio D. Bernardi de Montfaucon , monachi ordinis S. Benedicti e congregatione S. Mauri, opem ferentibus aliis ex codem\nsodalitio, monachis . Greek and Latin, Paris, 1718\u2013\u201938, in\n13 vols., fol. This is the best edition, and the result of about\ntwenty years of the patient labor of Montfaucon (d. Dec. 21, 1741,\n86 years old), and several assistants of the brotherhood of St. Maur. More than three hundred mss. were\nmade use of, but the eight principal mss. ,\nas Field has shown, were not very carefully collated. Montfaucon,\nwho at the date of the completion of his edition was 83 years old,\nprepared valuable prefaces to every treatise and set of homilies,\narranged the works in chronological order, and added in vol. XIII. learned dissertations on the life, doctrine, discipline and\nheresies of the age of Chrysostom." };

describe('addendum 2 shape: machine-generated word/phrase indexes', () => {
  it('a "X Words and Phrases" heading is a word index', () => {
    const v = frontMatterVerdict(OWEN_WORD_INDEX);
    expect(v.apparatus).toBe(true);
    expect(v.kind).toBe('word-index-title');
  });

  it('covers every language variant in the suppressed list', () => {
    for (const h of ['Latin Words and Phrases', 'German Words and Phrases', 'French Words and Phrases']) {
      expect(frontMatterVerdict({ heading: h, body: 'Abgott:\n1' }).apparatus).toBe(true);
    }
    expect(frontMatterVerdict(SCHAFF_GERMAN_INDEX).apparatus).toBe(true);
  });

  it('a heading-less flat row whose first line is "Index of … Words and Phrases" fires', () => {
    expect(frontMatterVerdict(HEADLESS_INDEX).kind).toBe('word-index-title');
  });
});

describe('addendum 2 shape: publisher catalogues and price lists', () => {
  it('a catalogue title fires', () => {
    expect(frontMatterVerdict(TENNYSON_CHEAP_EDITIONS).kind).toBe('publisher-catalogue-title');
    expect(frontMatterVerdict(TRAHERNE_PREPARING).kind).toBe('publisher-catalogue-title');
  });

  it('a bibliographic format+price heading fires (the Traherne ad headings)', () => {
    expect(frontMatterVerdict(TRAHERNE_FORMAT_HEADING).kind).toBe('publisher-catalogue-title');
  });

  it('a body that is a shillings-and-pence price list fires', () => {
    expect(frontMatterVerdict(TENNYSON_PRICE_LIST).kind).toBe('publisher-price-list-body');
  });

  it('a body of press-puff advertisements with prices fires', () => {
    expect(frontMatterVerdict(SPURGEON_AD_299).kind).toBe('publisher-blurb-body');
    expect(frontMatterVerdict(SPURGEON_AD_300).kind).toBe('publisher-blurb-body');
  });
});

describe('the new shapes do NOT fire on the content ADR-029 ruled genuine', () => {
  it.each([
    ['schaff-creeds comparative table (KEPT)', SCHAFF_COMPARATIVE_TABLE],
    ['calvin general index of chapters (KEPT)', CALVIN_INDEX_OF_CHAPTERS],
    ['spurgeon §298 mixed chunk (KEPT — re-slice, not a finding)', SPURGEON_MIXED_298],
    ['a plain sermon opening', SERMON_OPENING],
  ])('%s is not flagged', (_label, entry) => {
    expect(frontMatterVerdict(entry).apparatus).toBe(false);
  });
});

describe('the per-work sweep: author-aware foreign matter, head AND tail', () => {
  it('a head banner naming a different father fires under the declared author', () => {
    const v = foreignMatterVerdict(ORIGEN_HEAD_CLEMENT, { author: 'Origen of Alexandria' });
    expect(v.foreign).toBe(true);
    expect(v.kind).toBe('foreign-work-banner');
    expect(v.evidence).toMatch(/Clement/);
  });

  it('the genuine Origen banner does NOT fire under Origen', () => {
    expect(foreignMatterVerdict(ORIGEN_GENUINE, { author: 'Origen of Alexandria' }).foreign).toBe(false);
  });

  it('a commentary banner naming an APOSTLE is not foreign — the epistle is the subject', () => {
    const v = foreignMatterVerdict(
      { body: 'The Epistle of Paul the Apostle to the Romans. ———— Chapter I.—Paul, a servant of Jesus Christ, called to be an apostle…' },
      { author: 'John Calvin' },
    );
    expect(v.foreign).toBe(false);
  });

  it('a byline naming a different author fires', () => {
    expect(foreignMatterVerdict(TRAHERNE_BYLINE, { author: 'Thomas Traherne' }).foreign).toBe(true);
    expect(foreignMatterVerdict(CHRYSOSTOM_PROLEGOMENA_HEAD, { author: 'John Chrysostom' }).foreign).toBe(true);
  });

  it('a byline late in a MIXED chunk does not fire — §298 stays kept', () => {
    expect(foreignMatterVerdict(SPURGEON_MIXED_298, { author: 'Charles Haddon Spurgeon' }).foreign).toBe(false);
  });

  it('an all-caps possessive banner naming another author fires; GOD\'S does not', () => {
    expect(
      foreignMatterVerdict({ body: "HAYDN'S DICTIONARY OF DATES, and UNIVERSAL REFERENCE, relating to all Ages and Nations…" }, { author: 'Alfred Tennyson' }).foreign,
    ).toBe(true);
    expect(
      foreignMatterVerdict({ body: "GOD'S WORD is here set forth in its purity and truth for the people…" }, { author: 'John Calvin' }).foreign,
    ).toBe(false);
  });

  it('sweepWorkMatter holds a composite work and passes a clean one', () => {
    const genuine = {
      heading: 'How Christians are the Spiritual Israel.',
      body: 'That people which was called of old the people of God was divided into twelve tribes…',
    };
    const composite = [...Array(14).fill(genuine), ORIGEN_HEAD_CLEMENT]; // foreign work bound in at the TAIL
    const sweep = sweepWorkMatter(composite, { author: 'Origen of Alexandria' });
    expect(sweep.held).toBe(true);
    expect(sweep.findings.some((f: any) => f.position === 'tail' && f.kind === 'foreign-work-banner')).toBe(true);

    const clean = sweepWorkMatter([ORIGEN_GENUINE, SERMON_OPENING], { author: 'Origen of Alexandria' });
    expect(clean.findings).toHaveLength(0);
    expect(clean.held).toBe(false);
  });
});

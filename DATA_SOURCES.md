# Data Sources — Bibles & Commentaries (licensing + strategy)

Reference for acquiring complete, structured, legally-clean Bible + commentary data to host, render, and embed. The **concrete itemized grab-list** (exact works, sources, editions) lives in [`docs/ACQUISITION_MANIFEST.md`](docs/ACQUISITION_MANIFEST.md); this file is the licensing rationale behind it.

## The two legal layers (never conflate them)

1. **Content copyright** — is the *text itself* public domain / openly licensed? (Pre-1929 works and most classic commentaries: yes. But a modern *translation* of a PD original carries its own fresh copyright — see the translation trap in the manifest.)
2. **Site Terms of Service** — even when content is PD, a *website's* ToS can forbid scraping / commercial reuse of *its files and markup*. Enforceable contract issue (breach of contract, trespass-to-chattels — hiQ v. LinkedIn ended in a $500k judgment against the scraper), wholly separate from copyright.

**Rule:** take PD *text* only from sources that either license their files for commercial reuse or are neutral repositories of the original editions. Do not scrape ToS-protected aggregators (BibleHub, StudyLight).

## Bibles

- **Build the embedded/search core on PUBLIC-DOMAIN translations:** BSB (primary, modern, PD 2023) + WEB/KJV/ASV/YLT/Darby. Sources: berean.bible, github.com/seven1m/open-bibles, github.com/scrollmapper/bible_databases, eBible.org.
- **Open-licensed extras:** openbible.info cross-references (CC BY 4.0); unfoldingWord ULT/UST (CC BY-SA).
- **Modern copyrighted (ESV/NIV/NASB/NLT/CSB) — cannot embed.** Every publisher forbids storing full text; ESV licenses to organizations not solo devs; NIV needs a legal entity + a separate AI/ML license. The only indie channel is API.Bible (per-request *display* only, never stored, ~$10/mo/translation, no NIV). **Architecture:** semantic search runs over PD text; copyrighted translations are display-only, later, via licensed API. (See ADR-004.)

## Original languages (interlinear / word study)

These power the reader's interlinear + word panels (`ingest-original.ts`, `ingest-strongs.ts`). **Attribution
is displayed in `web/src/components/interlinear.tsx` — required by the licences below; do NOT call these
"public domain."**

- **Greek NT text — SBLGNT** (The Greek New Testament: SBL Edition). © 2010 Society of Biblical Literature &
  Logos Bible Software. **CC BY 4.0** — attribution required. Source: `github.com/morphgnt/sblgnt`.
- **Greek NT morphology — MorphGNT** (morphologically parsed SBLGNT; Tauber et al.). **CC BY-SA 3.0** —
  attribution + share-alike. Source: `github.com/morphgnt/sblgnt`.
- **Hebrew OT text + morphology — Open Scriptures Hebrew Bible (OSHB / morphhb)**. **CC BY 4.0** — attribution
  required. Source: `github.com/openscriptures/morphhb`.
- **Strong's numbers + definitions** — **public domain** (Strong's Exhaustive Concordance, 1890). Source:
  `github.com/openscriptures/strongs`. (This one *is* PD; the text + morphology above are not.)

## Commentaries + sermons

- **Primary: SWORD/CrossWire modules** (bulk download intended, per-module license, complete works, verse-keyed). Parse with `libsword`/`diatheke` (pysword is Bible-only). Filter each `.conf` `DistributionLicense` to Public Domain; exclude KingComments, NET notes, Lockman.
- **Fills + full works:** Matthew Henry, JFB, Gill, whole-Bible Barnes from Project Gutenberg / archive.org / sacred-texts (neutral PD text — re-mark, don't ship CCEL markup).
- **Church fathers:** ANF/NPNF (Schaff) from archive.org + Wikisource.
- **Broader traditions + sermons:** see `docs/ACQUISITION_MANIFEST.md` §3–§4 (Spurgeon ~3,560; Luther/Lenker; Catholic a Lapide/Aquinas; Anglican Poole/Ryle/Maclaren; Anabaptist Menno Simons; etc.).
- **CCEL** = reference/discovery only; its editions/markup are commercially restricted. Use the underlying PD text, re-provenance.
- **STEP Bible** (CC BY 4.0) for versification/lexicons; **Tyndale Open Study Notes** (CC BY-SA) for a modern voice.
- **Never scrape** BibleHub / StudyLight / monergism / sermonaudio.

## Compliance to bake into ingestion

- Store a **per-work provenance + license record** (source, license, **translator + edition year**, PD basis) for every item.
- Ingest **only** Public-Domain or commercially-permissive CC (BY, BY-SA). Quarantine everything else — fail closed.
- **The translation trap:** a PD author with a post-1929 translation is NOT usable — record translator+year, verify ≤1929.
- Never store full text of copyrighted translations (ESV/NIV/NASB/NLT/CSB) — display-only via licensed API if at all.

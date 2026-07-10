# Re-sourcing Plan — replace forbidden/restricted provenance before scale-up

**Status: PLAN ONLY — awaiting owner approval. No re-sourcing code until approved.**
Gates the scale-up of the `sources`/`sections` migration to the other ~400 works (Track 1 of the 2026-07-10 directive). Executes the ADR-008 / CLAUDE.md aggregator rail. Sizes the footprint from the live corpus, picks a permitted source per work, and defines the **text-match test** that decides *keep the vector ($0)* vs *re-embed*.

## 1. Footprint (measured from Neon, 2026-07-10)

The forbidden-aggregator gate (biblehub/studylight, now enforced by Gate B) is **narrower than feared by work count but concentrated in the biggest works**:

| Provenance host | Works | Eligible entries | Embeddings | Status |
|---|---:|---:|---:|---|
| **biblehub.com** | **14** | **176,553** | **16,072** | 🚫 forbidden (ADR-008) — re-source |
| studylight.org | 0 | 0 | 0 | 🚫 forbidden — none present |
| ccel.org / www.ccel.org | 17 | ~412 | small | ⚠️ CCEL editions/markup "commercially restricted" (ADR-008) — re-source the text |
| historicalchristian.faith | 149 | 62,444 | large | ❓ **unvetted** — single biggest by works; needs a ToS/license check before trust |
| **(no source_url recorded)** | **242** | **78,716** | large | ⚠️ **provenance missing** — Gate B requires `provenance.url`; must be backfilled |
| archive.org / web.archive.org | 17 | ~244 | small | ✅ permitted |
| books.google.com, sacred-texts, gutenberg, newadvent, tertullian, earlychristianwritings … | ~30 | small | small | mostly ✅ PD (spot-check ToS) |

**Two facts that shape everything:**
1. **biblehub = 14 works but they are the mega-commentaries** (Barnes, Calvin, Wesley, Darby, Bengel, Matthew Poole, Pulpit, Cambridge, Geneva, Scofield, MacLaren, Lange, Benson, B.W. Johnson) — ~52% of the corpus by raw entries. **But under the current `source_id` collapse they are only 16,072 embeddings (~9% of 173,806)** — so the re-embed *worst case* is small (§4).
2. **The forbidden-domain gate is not the whole provenance problem.** A clean scale-up also has to resolve CCEL (restricted), the **242 works with no recorded provenance**, and vet **historicalchristian.faith**. These are surfaced here so scope isn't discovered late; only biblehub/studylight are gated by code today.

## 2. Permitted source per work-type (the sourcing map)

Permitted primaries (ADR-008 / DATA_SOURCES.md): **SWORD/CrossWire** (structured, explicit per-module license — best for verse-by-verse commentary), **Wikisource** (PD transcriptions), **archive.org** (PD scans/OCR), **STEP Bible** (CC BY).

| Work-type | Primary | Fallback | Notes |
|---|---|---|---|
| Verse-by-verse commentary (Barnes, Calvin, Wesley, Darby, Poole, Benson, B.W. Johnson) | **CrossWire module** | Wikisource | CrossWire carries most of these with a clear `DistributionLicense`. |
| Study-Bible notes (Geneva, Scofield 1917, Cambridge) | Wikisource / archive.org | — | Scofield 1917 is PD; verify Cambridge edition year. |
| Exposition/homiletic (Pulpit, MacLaren) | archive.org | Wikisource | Large multi-volume scans. |
| **Translated** works (Bengel *Gnomon*, Lange) | archive.org (PD English translation) | — | ⚠️ **edition trap** — the *translation* must be pre-1929; record translator + year. |
| Fathers/historians (`historicalchristian.faith`, newadvent, CCEL) | archive.org / Schaff (PD) | STEP/Wikisource | Re-source the *text*; don't depend on the aggregator's markup. |

## 3. The re-sourcing procedure — text-match decides keep-vs-re-embed

For each section of a to-be-re-sourced work, per verse anchor:

1. **Fetch** the same work+verse text from its permitted source (§2), recording new `provenance` (url, edition/translator, year, retrieved_at, checksum).
2. **Normalize both** the stored `section.body` and the permitted text with the *existing* ingest normalizer (`sanitizeForIngest` + `normalizeForMatch`: entity-decode, whitespace-collapse, case/punctuation-fold) — the same normalization the verifier already trusts.
3. **Compare:**
   - **MATCH** (normalized-equal, or ≥ a token-overlap threshold to be set — propose 0.98 Jaccard): the text that produced the vector is the same public-domain text, merely obtained legitimately. → **Provenance-repair: update `sources.provenance` to the permitted source and KEEP `section.body` + its existing `section_embedding` unchanged. $0, no re-embed, coverage stays 0.**
   - **DIFFER** (permitted edition materially different): the stored vector no longer represents the section's corrected text. → **Re-source: replace `section.body` with the permitted text and RE-EMBED that section** (new vector, pinned `bge-large-en-v1.5`). Run per-work so Gate A stays 0 for completed works.
   - **NO permitted source found / license unconfirmed:** → **quarantine** the work (Gate B already enforces this via the `quarantine` marker); never published.

**The match test is itself a gate:** a section may only be re-labeled "permitted provenance" if its text *actually matches* a permitted source. A biblehub string cannot be silently relabeled — it must match or be re-embedded/quarantined. This is the fail-closed version of provenance-repair.

## 4. Cost — both paths

- **Provenance-repair (text matches):** **$0 embedding.** Cost is engineering: one fetcher/parser per permitted source format (CrossWire via `libsword`/`diatheke`; Wikisource/archive.org HTML/XML) + the matcher. This is expected to cover most biblehub works (same PD text).
- **Re-embed (text differs):** bounded by **16,072 biblehub embeddings ≈ 9% of the corpus ≈ ~$0.07** (pro-rata to the ~$0.74 full-corpus embed). Dollar cost is negligible; the real cost is the per-work coverage discipline (re-embedding reopens Gate A for that work until complete — run per-work, prove gap 0 before publish).
- **Not a re-key / not a re-migration:** re-sourcing edits `section.body`/`provenance` and (only on DIFFER) one `section_embedding` per section in place. Section identities are stable (MIGRATION_DESIGN §4.1) — no new sections, no re-ordinaling.

## 5. Phasing (proposed)

1. **Vet the unknowns first** (cheap, unblocks scope): confirm the license/ToS of **historicalchristian.faith** (149 works) and decide CCEL (17). Backfill provenance for the **242 no-URL works** (or quarantine those that can't be sourced).
2. **biblehub re-source, one work end-to-end** (Barnes — already staged/quarantined): CrossWire Barnes → match test → repair-or-re-embed → prove Gate A(sections)=0 + Gate B green + retrieval unchanged → **then** the other 13 biblehub works.
3. Only after biblehub + the §1 provenance gaps clear does the migration scale-up (publish the other ~400 works) proceed.

## 6. Open decisions (approve / redirect before any code)

1. **Match threshold:** exact normalized-equality, or a token-overlap floor (propose ≥ 0.98 Jaccard) with the remainder re-embedded? (Looser = more $0 repairs but risks blessing a drifted edition.)
2. **historicalchristian.faith (149 works):** vet its terms — permitted, or add to the forbidden list? This is the single largest bucket and could dwarf biblehub.
3. **242 no-provenance works:** backfill provenance, or quarantine pending sourcing? (Gate B fails them closed either way until `provenance.url` exists.)
4. **CCEL (17 works):** re-source the text off CCEL (ADR-008 restricted) or accept as low-risk PD-text/attribution-only?
5. **Scope of "re-sourcing" now:** just biblehub (the coded gate), or the full provenance cleanup (biblehub + CCEL + no-URL + historicalchristian.faith) before *any* scale-up? Recommend the full cleanup — a scale-up that publishes 242 no-provenance + 149 unvetted works is the same class of risk as biblehub.

---

## 7. Findings from vetting (2026-07-10) — scope APPROVED (full cleanup), approach revised

Owner approved **full provenance cleanup before any publish**; parity taken **by construction** (no harness). Vetting the unknowns first (§5.1) materially reshaped the plan:

**Tooling reality — SWORD/CrossWire is NOT available** (`diatheke`/`installmgr`/`pysword` absent). The "CrossWire primary" is not usable as-is. **Revised: re-source over HTTP from confirmed-PD editions** — archive.org, Wikisource, Schaff ANF/NPNF (fathers) — one parser per format; install `libsword` only if a work exists *only* as a SWORD module. → open decision.

**The 242 "no-provenance" works are two different buckets:**
- **4 major PD commentaries with lost provenance — Gill (28,300), JFB (16,966), Clarke (13,318), Matthew Henry (4,124) = 62,708 entries.** Unambiguously PD (pre-1900); just need a confirmed-PD source URL recorded + a text-match (mostly $0 repair).
- **235 patristic works (~19k entries)** — fathers, PD *by age* but the **translation edition is unconfirmed (edition trap)**.

**historicalchristian.faith (149 patristic works) — UNVETTED; treat as an aggregator, not a permitted source.** Its about page states only "open source, crowd-sourced," **no license grant**, no edition attribution, and lists **non-PD authors (C.S. Lewis, d. 1963)** — so its specific father *translations* cannot be assumed PD. Same risk class as biblehub. **Recommend: re-source the fathers from confirmed-PD translations (Schaff) and add `historicalchristian.faith` to `FORBIDDEN_PROVENANCE_DOMAINS`.**

**True shape of the cleanup (by difficulty, not the biblehub headline):**
1. **PD commentaries → provenance-backfill (easy):** the 14 biblehub + 4 no-provenance mega-commentaries are all clearly PD; work = record a confirmed-PD source + text-match (mostly $0 repair).
2. **Patristic → edition-verification (hard, the real bulk):** ~384 works (149 historicalchristian.faith + 235 no-provenance) where PD hinges on the *translation* year. Re-source from Schaff ANF/NPNF (PD, pre-1900) or verify per-work.
3. CCEL (17) + misc — small.

**First buildable unit (proposed):** the **text-match + provenance-repair engine**, proven on ONE PD commentary end-to-end — re-source Barnes from a confirmed-PD HTTP source, normalized match → repair-in-place (keep vectors) or re-embed diffs → Gate A/B green + parity unchanged. Then the other PD commentaries; then the patristic edition-verification.

**Open decisions (checkpoint before building):**
1. **Tooling:** HTTP re-source from archive.org/Wikisource/Schaff (no install, one parser per format), or install `libsword`? *Recommend HTTP-first.*
2. **historicalchristian.faith:** add to forbidden-domains + re-source the 149 fathers from Schaff? *Recommend yes.*
3. **Patristic edition trap:** accept Schaff ANF/NPNF (PD) as the canonical father source for all ~384 patristic works, or verify per-work?
4. **First unit = the match/repair engine on Barnes?** or a different starting work?

*No fetchers/parsers/matchers written until the tooling approach (decision 1) is chosen — SWORD being unavailable changes the design.*

## 8. Decisions taken + clean source found (2026-07-10)

**Decisions:** (1) tooling = **HTTP-first**; (2) **forbid `historicalchristian.faith`** (now in `FORBIDDEN_PROVENANCE_DOMAINS`) + **Schaff ANF/NPNF as the canonical PD father source**.

**Major de-risk — `bible.helloao.org` ("Free Use Bible API") cleanly carries 4 of the no-provenance mega-commentaries, all Public Domain (CC PD Mark 1.0), structured per-chapter, with an explicit license field:**

| helloao id | Work | Our entries | License |
|---|---|---:|---|
| `adam-clarke` | Adam Clarke | 13,318 | Public Domain |
| `jamieson-fausset-brown` | JFB | 16,966 | Public Domain |
| `john-gill` | John Gill | 28,300 | Public Domain |
| `matthew-henry` | Matthew Henry | 4,124 | Public Domain |

That's **62,708 entries (the entire no-provenance-commentary bucket) from one clean, permitted, structured API** — and the repo already has `ingest-helloao-commentaries.ts` for its shape. helloao also has `keil-delitzsch` (PD) and `tyndale` (CC BY-SA). It does **not** carry the biblehub 14 (Barnes/Calvin/Wesley/…) — those still need Wikisource/archive.org.

**Revised sourcing map:**
- **helloao (PD, structured):** Gill, JFB, Clarke, Matthew Henry, Keil-Delitzsch → text-match → provenance-repair (helloao url + PD).
- **Wikisource/archive.org:** the biblehub 14 PD commentaries.
- **Schaff (archive.org):** the ~384 patristic works (historicalchristian.faith + no-provenance patristic).

**First slice (building now):** the **text-match engine**, proven on real helloao data — fetch a helloao PD commentary, align per-verse to our stored `embeddings.content`, report normalized-match rate = the split between $0 provenance-repair and re-embed. Then repair one work's provenance (config entry) end-to-end. No publish until the whole cleanup clears (owner's "full cleanup first").

### 8.1 Text-match probe result (`resource-match-probe.ts`, 2026-07-10)

Ran the probe on **Adam Clarke** vs `helloao/adam-clarke` (10-chapter sample across OT/NT, 227 verses present in both):

| Bucket | Verses | |
|---|---:|---|
| MATCH (Jaccard ≥ 0.9) | 150 | same text |
| TRUNCATED (Jaccard < 0.9 but containment ≥ 0.9) | 77 | **same text, our copy just cut short** |
| **→ $0 provenance-repair (match + truncated)** | **227 (100%)** | keep every vector |
| DIFFER (genuine edition difference → re-embed) | **0 (0%)** | — |
| helloao verses with no stored counterpart | 0 | clean alignment |

**Every sampled Adam Clarke verse is the same PD text as helloao** — the initial 34% "differ" was entirely *truncation* (our stored text is a cut-short copy of the identical work), which containment caught and which is still a $0 repair. **Implication: the whole 62,708-entry no-provenance-commentary bucket (Gill, JFB, Clarke, Matthew Henry) is expected to re-source at $0** — keep all vectors, just record helloao's PD provenance. Re-embed is likely reserved for the biblehub-14 (Wikisource/archive sources) and the patristic Schaff work, if at all.

**Next unit:** the provenance-repair pipeline — full per-work match verification (all books, not a sample) → write config entries with helloao PD provenance for the 4 works → they're clean + ready for the scale-up migration. Still no publish until the full cleanup (incl. biblehub-14 + patristic) clears.

### 8.2 helloao repair DONE + patristic probe (2026-07-10)

**helloao commentaries — DONE, $0.** Full per-work verification (`resource-repair-helloao.ts`): Gill 28,279 / JFB 15,267 / Clarke 12,571 / Matthew Henry 4,124 = **~60,241 verses, ~99.99% $0 provenance-repair, 3 genuine-differ total.** Config entries written with helloao PD provenance + a forward-compatible `rebuild` recipe (per-verse endpoint) per work. Truncation logged as a tracked quality-limitation (Matthew Henry 88% truncated — same PD text, full text recoverable via the recipe; **no rebuild now — eval-gated**).

**Patristic strategy REVISED — not blanket Schaff-canonical.** The probe (anchor points + author/edition classification) shows the ~384-work patristic bucket is **mixed**:
- **PD-repairable:** ANF/NPNF core (Chrysostom — *verified* verbatim vs NPNF; Augustine, Tertullian, Origen, Cyril, Clement, Cyprian, Irenaeus) + *Catena Aurea* (Newman 1841 PD, the "as quoted by Aquinas" entries). ≈ half.
- **DROP (modern copyrighted translations only):** **Theophylact (6,470), Bonaventure (4,185), Oecumenius (1,753), Jerome's prophet commentaries** (verified: no PD translation). ≈ 20–30%.
- **Per-work edition check:** Aquinas's own lectures, Bede, Gregory the Great, Ambrose.

So the patristic re-source is **edition-classify → repair-to-Schaff-if-PD → DROP-if-modern-only**, not a blanket Schaff fetch. Expect to drop ~12–18k entries. This is the next build after biblehub-14; a precise repair/drop rate needs the per-work edition classification.

## 9. Reusable module built; biblehub-14 blocked on a clean HTTP source (2026-07-10)

**Reusable re-source module — BUILT + proven.** `resource-textmatch.ts` is the source-agnostic core (the match/truncated/differ matcher + `tallyMatch` + the `SourceAdapter` contract), unit-tested (`test/resource-textmatch.test.ts`, 5 cases). `helloao-source.ts#helloaoAdapter` is the reference adapter; the helloao repair now runs **through the generic matcher** (same ~99.99% result). **The same core will drive the patristic phase** — only a new adapter (NewAdvent/Schaff/CCEL-text) is needed, not a new matcher.

**biblehub-14 have NO clean HTTP per-verse source (unlike helloao):**
- helloao / other JSON APIs: **none** of the 14 (helloao carries only the 6 already used).
- Wikisource: **no** structured Barnes/etc. (verified).
- archive.org: **OCR scans only** — continuous text, no per-verse structure; brittle/lossy to align.
- **CrossWire SWORD: cleanly has Barnes, Calvin, Wesley, Scofield, Darby** (explicit per-module licenses) — but needs `libsword`/`diatheke`, which decision-1 deferred ("HTTP-first"). Not on CrossWire: Poole, Bengel, Pulpit, Cambridge, Geneva, MacLaren, Lange, Benson, B.W. Johnson.

**So the 14 split:** ~5 CrossWire-available (need libsword) · ~9 with no clean structured source (archive-OCR/manual) · all are **PD text** (the only issue is biblehub ToS/provenance, mitigated by not publishing them).

**Decision needed (reopens tooling for THIS bucket, since the 14 lack HTTP sources):**
- (a) **Install `libsword`** → re-source the ~5 CrossWire works cleanly (through the same matcher); archive-OCR or hold the other ~9.
- (b) **archive.org OCR parsers** per work — high effort, brittle, uncertain quality.
- (c) **Hold the biblehub-14 quarantined** (PD text, not published/served — biblehub-ToS risk mitigated, reversible) until clean sources exist; helloao ✓ and patristic proceed. *Recommended interim* — the 14 are already excluded from publish (only Barnes is in the config, quarantined; the other 13 aren't migrated, and Gate B fails-closed on biblehub provenance).

**Hold list (biblehub-14, quarantined / excluded from publish pending clean sourcing):**
- *CrossWire-available (need libsword):* Barnes' Notes, John Calvin, John Wesley, C.I. Scofield, J.N. Darby.
- *No clean source (archive-OCR/manual):* Matthew Poole, Johann Bengel, Pulpit Commentary, Cambridge Bible, Geneva Study Bible, Alexander MacLaren, J.P. Lange, Joseph Benson, B.W. Johnson.

**Recommend (c) now + (a) with the patristic phase:** hold the 14; when building the patristic NewAdvent adapter, also add a CrossWire adapter (install libsword) for the ~5 — same matcher, one more adapter.

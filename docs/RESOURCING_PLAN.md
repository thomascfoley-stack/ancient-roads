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
*No fetchers, parsers, or matchers will be written until this is approved. First code on approval = the Barnes CrossWire re-source (one work, match-test proven) before the other 13.*

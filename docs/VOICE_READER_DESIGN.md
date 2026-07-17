# Voice Reader — lite design (for critical review)

**Status:** Draft / pre-approval. Not built. Written to be torn apart before any code.
**Author:** (PM + Claude research pass, 2026-07-16)
**Scope of this doc:** how to add spoken narration to the Bible reader — nice, fast, adjustable-speed, cheap, and able to **start playback at any verse, not just verse 1.**
**Out of scope:** narrating commentary / `/ask` teacher output (see §9 — deliberately excluded to protect the product guarantee), copyrighted translations, multi-language.

Reviewers: jump to **§8 Open questions** and **§10 Where this is probably wrong** — that's where I want the fight.

---

## 1. The one insight that reframes everything

The Bible text is **static and finite** — ~4M characters / ~800k words / ~1,189 chapters / ~85–90 hours of audio per translation. So we **pre-generate audio once and cache it forever** as static files on the CDN, exactly like the corpus is already served (`web/public/bible/{translation}/{slug}.json`).

Consequences:

- **Per-character TTS price becomes a one-time capex, not a per-listener cost.** Voicing an entire translation costs **$0–$120 *once*** at every quality tier we'd consider. Even ElevenLabs' best voice is a few hundred dollars — total, forever. So we optimize for **voice quality + clean redistribution rights**, not per-character price.
- **We do NOT need a streaming/real-time TTS API.** "Adjustable, sliding speed" is the browser's `<audio>.playbackRate` (0.5×–2×, pitch-preserved) on a pre-rendered file. No live synthesis on the request path — which also keeps us aligned with the repo rule "keep embeddings/LLM calls off the request path."
- **The recurring cost is just CDN + storage of MP3/Opus files (pennies).** No per-user wallet-DoS surface, unlike `/ask`.

If reviewers accept only one thing, accept this: **this is a batch content-generation problem, not a live-API problem.**

---

## 2. How "start at any verse" works (the core UX requirement)

Two candidate audio granularities:

**Option A — one file per verse (~31k tiny files/translation).** Start-anywhere is trivial (play the file). But: robotic prosody (each verse read in isolation, no sentence flow across verse boundaries), 31k HTTP objects, awkward gaps, and no natural "read the whole chapter" flow.

**Option B — one file per chapter + a verse-timing map (RECOMMENDED).** Render each chapter as a single natural-sounding MP3 (~1,189 files/translation), and alongside it store a tiny JSON map of **verse → start/end timestamp**:

```
web/public/audio/{voice}/{translation}/{slug}/{chapter}.opus
web/public/audio/{voice}/{translation}/{slug}/{chapter}.json   // [{v:1,start:0.0,end:4.2}, {v:2,...}]
```

To start at verse 32: load the chapter file, `audio.currentTime = map[32].start`, play. To highlight the verse being read: on `timeupdate`, find the verse whose `[start,end)` contains `currentTime` and paint the existing inline highlight. This gives us **start-anywhere, verse-accurate seek, and karaoke-style highlight from the same artifact** — and natural chapter-flow prosody.

**Where the timestamps come from at generation time** (not the request path):
- Cloud providers emit them directly: **Amazon Polly "speech marks"**, **Azure word-boundary events**, **ElevenLabs character-level alignment**, OpenAI/others via returned timings. We aggregate word marks up to verse boundaries.
- Self-hosted **Kokoro/Piper** don't emit marks → run **forced alignment** (e.g. `aeneas`/`whisperX`) once at build time against the known verse text. Cheap, offline, one-time.

This map is the single most important artifact in the design. **Reviewers: is per-chapter + timing map the right call, or is per-verse simpler enough to win?** (My view: chapter+map, because prosody and highlight sync matter for a listening product.)

### Reader integration (already-present hooks — low surprise)
The recon confirms the plumbing exists:
- `web/src/components/verse-display.tsx` renders each verse as an inline `<span data-verse={n}>` / `<span data-verse-text={n}>` — ready-made anchors for "start here" and the moving highlight.
- `read/[book]/[chapter]/page.tsx` already holds `selectedVerse` + `onVerseClick` state and paints an inline highlight (`bg-accent-100/70`) — the voice highlight reuses this exact mechanism.
- Verse identity: `encodeVerseId({book,chapter,verse})` (numeric packed id, `web/src/bible/verse-id.ts`). Note the DOM only carries the **local** verse number; book/chapter come from route state — fine, we have both in the reader.
- A play/pause/speed transport bar fits the existing docked action-bar / `StudyPanel` bottom-sheet pattern.

**Net-new:** the audio pipeline, the player component + transport UI, the timing-map format, and (for premium/gating) the tier layer. There is currently **zero** audio/TTS code in the repo — greenfield.

---

## 3. Cost to voice one full public-domain translation (one-time)

| Tier intent | Engine | Quality | One-time cost / translation | Store + redistribute rights |
|---|---|---|---|---|
| Free | **Kokoro-82M** (self-host, Apache-2.0) | Good–excellent on clean prose | **~$0** (CPU) / a few $ on rented GPU | Own + redistribute freely |
| Free (alt) | **Existing PD human recordings** (LibriVox KJV, FCBH/eBible WEB) | Human voice, variable | **$0** | Public domain |
| Paid | **Amazon Polly Neural** | Good, natural | **~$64** | **TOS explicitly allows caching + replay** (cleanest) |
| Paid (alt) | **Hume Octave 2** | Very good | **~$30** | Allowed on paid plan |
| Premium | **OpenAI gpt-4o-mini-tts** | Very good, steerable tone | **~$80** | API output owned by us |
| Premium (flagship) | **ElevenLabs** | Best naturalness | **~$200–$480** | Perpetual commercial rights on paid plan |

Pricing basis: ~4M chars/translation. Official-page-corroborated for Google/Azure/Polly/OpenAI/LMNT; ElevenLabs/Hume/Cartesia normalized from mid-2026 aggregators and **should be re-quoted live before committing** (their credit/subscription pricing hides a clean per-char rate). Full source list in the research appendix (§11).

The takeaway: **the whole product's audio capex is in the low hundreds of dollars, one time.** Storage/CDN is the only recurring line and it's negligible.

---

## 4. Recommended three-tier mapping

You asked for options across free / paid / premium. Recommendation:

- **FREE — Kokoro (pre-rendered, CDN) with Web Speech API as offline fallback.** Zero marginal cost, Apache-2.0 lets us store and serve the files, genuinely good on punctuated Bible prose, consistent voice across all devices (unlike Web Speech, which is our *fallback only* — see §6). Optionally seed some books with LibriVox/FCBH human recordings where quality beats TTS.
- **PAID ("pro") — Amazon Polly Neural** (or Hume Octave 2 for a nicer voice at lower cost). Solid, natural, cleanest caching rights. Same pre-render-and-cache model.
- **PREMIUM ("scholar") — ElevenLabs** for a flagship reverent narration, or **gpt-4o-mini-tts** as the value premium (~$80, steerable to a calm reading tone). One voice, pre-rendered, cached.

All three tiers are **the same architecture** — pre-generate → static files → client `playbackRate`. Tiers differ only in *which pre-rendered voice set the player is allowed to load*. That means tiering is a **content-access gate, not a runtime-synthesis gate** — cheap and safe.

**Gating mechanism:** the schema already has a dormant `user_profiles.plan` column (`free`/`pro`/`scholar`) that **no code reads or writes today**. Wiring it (read plan in `requireUser()` path → decide which `{voice}` directories the client may request) is net-new but small. No per-request TTS spend means **no wallet-DoS surface** — a big simplification versus `/ask`.

---

## 5. Proposed data model & pipeline (smallest slice first)

**Storage.** Mirror the existing static-corpus pattern: `web/public/audio/{voice}/{translation}/{slug}/{chapter}.{opus,json}`, served by Vercel's CDN. Opus for size (~half of MP3), MP3 fallback if we hit Safari/codec issues. **Caveat:** committing ~1,189 audio files/voice/translation as binaries to git bloats the repo fast; if we voice several translations/voices we likely want **Vercel Blob or Cloudflare R2** instead of `public/` (net-new infra — flagged as a decision in §8). Start with ONE voice × ONE translation in `public/` to prove the slice, then decide.

**Generation harness** (offline CLI, like the existing ingest pipeline at repo root): for each chapter → concatenate verse texts → TTS → get audio + word marks → fold marks into verse timestamps → write `.opus` + `.json`. Idempotent, resumable, checksummed. Not on any request path.

**Vertical slice to build first (prove deep before wide):** one voice (Kokoro), one translation (WEB, the default), one book (e.g. John) → player in the reader with play/pause, speed slider, tap-a-verse-to-start, moving highlight → loaded in a real browser at 390px and desktop, no overflow, a real listen exercised (per the repo Definition of Done). Then fan out to the full corpus and the other tiers.

---

## 6. Free browser TTS (Web Speech API) — fallback only, not the product voice

Zero cost, no backend, but: **no consistent voice** (depends on OS/browser/device), quality ranges from decent (Edge/Windows) to robotic (mobile), **Chrome cuts utterances after ~15s/~200 chars** (must chunk + queue), **background-tab throttling** breaks long listening, Firefox-Android/Opera-Mobile don't expose it, iOS needs a user gesture. Fine as an **offline/accessibility fallback**; it cannot be the flagship experience. This is why FREE tier leads with pre-rendered Kokoro, not Web Speech.

---

## 7. Explicitly rejected options (so review doesn't relitigate)

- **Vapi / Retell / Bland** — voice-*agent* orchestration layers billed per conversational minute over the same TTS providers. Wrong tool: they add margin, meter per-minute not per-char, and assume live back-and-forth. Only relevant if we later add a *conversational* "ask the text" feature — not narration.
- **XTTS / Coqui** (CPML, non-commercial; company defunct so no license path) and **Fish Speech** (CC-BY-NC-SA) — **non-commercial licenses; unusable in a paid product.**
- **OpenAI ChatGPT Voice output** (as opposed to the **API**) — non-commercial, can't repackage as standalone audio. Use the API path only.
- **ElevenLabs free tier** — no commercial rights + forced attribution. Must be a paid plan.

---

## 8. Open questions / decisions needed (reviewer input wanted)

1. **Audio granularity:** per-chapter + timing map (my rec) vs per-verse files? Trade prosody/sync vs simplicity.
2. **Storage:** commit audio to `web/public/` (simple, but git bloat past 1 translation) vs add Vercel Blob / R2 (net-new infra)? At what point do we cut over?
3. **Which translation(s) first, and how many?** WEB (default) alone to start? Each added translation is another ~85h render + storage.
4. **Free-tier voice:** self-host Kokoro, or ship LibriVox/FCBH human PD recordings, or both? Human recordings are free + better but voice/coverage is inconsistent across books.
5. **Highlight granularity:** verse-level (simple, from the map) now, word-level "karaoke" later? Word-level needs word marks we're already capturing.
6. **Is tiering even in scope for v1?** We could ship a single free Kokoro voice first and defer `plan` gating + premium voices until billing exists (there is **no billing/Stripe code at all** today — premium tiers presuppose a payments build that doesn't exist).
7. **Synthetic-voice disclosure** in the UI (Azure/responsible-AI guidance expects it) — trivial, but decide the copy.

---

## 9. Product-guarantee check (the thing that must not break)

Ancient Paths is "a concordance, not a commentator" — it must never speak Scripture in its own interpretive voice. A voice reader that narrates **only the verbatim public-domain Bible text** does **not** touch the interpretation contract (I1–I6/G1) — it's reading the text, not commenting on it. The boundary is crossed **only if TTS ever narrates generated/commentary/`/ask` prose**, which this design explicitly excludes. Licensing boundary also holds: we pre-generate audio **only** for the 18 PD/permissive translations already shipped; **never** for ESV/NIV/NASB/etc. (display-only, and audio of them would be a licensing violation regardless of engine).

## 10. Where this is probably wrong (pre-mortem for the reviewer)

- **Git-bloat underestimate.** If we voice multiple translations/voices in `public/`, the repo could balloon into the GBs and slow every clone/deploy. The "start in public/, migrate to Blob later" plan may be optimistic — maybe we should build the Blob path from day one.
- **Forced-alignment accuracy for Kokoro.** If verse timestamps drift, "start at v32" lands on v31/v33 and the highlight desyncs. Cloud providers' native marks are more reliable; the free tier is the one most at risk. Needs a measured accuracy check, not a vibe.
- **ElevenLabs/Hume/Cartesia prices are aggregator-normalized, not official per-char** — re-quote before any commitment.
- **Premium tiers presuppose billing that doesn't exist.** If v1 tries to ship paid/premium, it drags in an entire payments build. Likely v1 should be free-only.
- **Opus/Safari codec edge cases** on older iOS could force MP3 (bigger files) — verify on device.
- **Per-listener cost really is ~$0** only if files are static-cached; if anyone later "improves" this into on-demand synthesis, the wallet-DoS surface returns. Guardrail that.

## 11. Research appendix — sources

Provider pricing/terms: ElevenLabs (https://elevenlabs.io/pricing/api, terms https://elevenlabs.io/terms-of-use), OpenAI TTS (https://platform.openai.com/docs/guides/text-to-speech, service terms https://openai.com/policies/service-terms/), Google Cloud TTS (https://cloud.google.com/text-to-speech/pricing), Azure Speech (https://azure.microsoft.com/en-us/pricing/details/speech/), Amazon Polly incl. caching-allowed (https://aws.amazon.com/polly/pricing/), Deepgram (https://deepgram.com/pricing), Cartesia (https://www.cartesia.ai/pricing), Hume Octave (https://www.hume.ai/pricing), LMNT (https://www.lmnt.com/pricing), PlayHT (https://voice.ai/hub/tts/play-ht-pricing/).
Open models + licenses: Kokoro (https://huggingface.co/hexgrad/Kokoro-82M), Piper/Chatterbox (https://www.resemble.ai/learn/models/chatterbox), Orpheus (https://github.com/canopyai/Orpheus-TTS), Fish Speech license (https://github.com/fishaudio/fish-speech/blob/main/LICENSE), XTTS/Coqui CPML (https://huggingface.co/coqui/XTTS-v2/blob/main/LICENSE.txt).
Voice-agent platforms: https://www.bland.ai/pricing, https://techsy.io/en/blog/retell-ai-vs-vapi-vs-bland.
Web Speech API: https://developer.mozilla.org/en-US/docs/Web/API/Web_Speech_API.
Free PD Bible audio: https://ebible.org/webaudio/, https://publicdomainaudiobibles.com/, https://www.audiotreasure.com/webindex.htm (LibriVox KJV, public domain).

*Pricing confidence: Google/Azure/Polly/OpenAI/LMNT official-corroborated; ElevenLabs/Deepgram/Cartesia/Rime/Hume/PlayHT normalized from mid-2026 aggregators — re-confirm with a live quote before committing. No figures fabricated.*

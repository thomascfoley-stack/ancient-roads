# Query Intents & Response Shapes (teacher routing)

The teacher must detect *what kind of question* the user is asking and shape the response accordingly — while **never interpreting Scripture** in either case.

## The intents

1. **Topical-scripture** — "what does the Bible say about X" (stealing, suicide, money, forgiveness…).
   **Response shape: Scripture first, commentary second.** Surface the relevant verses (verbatim, cited) as the primary content — *"The Bible addresses this in…"* — then 2–3 attributed commentary voices. **No gloss, no interpretation of the verses.**

2. **Interpretive / meaning** — "what does John 3:16 mean", "what's the view on X", life-advice-from-Scripture.
   **Response shape: Commentary first, scripture links second.** Lead with 2–3 attributed voices — *"Here's what Luther, Calvin, and Chrysostom say…"* — with scripture references below. **This is the current teacher shape.**

3. **Reference lookup** (optional) — "show me Romans 8" — direct navigation, no composition (the omnibox already does this).

## The guarantee holds in both

Never interpret. Intent classification and verse retrieval are *routing*, not interpretation. But **selecting which verses answer a topic is editorial** — so: surface a defensible set, quote verbatim, attribute, and never add the model's own gloss on what they mean. Both shapes pass the contract + verifier unchanged.

## The contract already supports both shapes

`OUTPUT_CONTRACT.md`'s block types express both without change: **reading blocks** = Scripture (Type 1 primary / Type 2 secondary); **voice blocks** = attributed commentary (Type 2 primary / Type 1 secondary). So the *response shapes are expressible today* — the new work is (a) intent routing and (b) one retrieval dependency.

## The retrieval dependency (Type 1 is NOT built)

Type 1 needs **topical / semantic VERSE retrieval**, which does not exist — the Bible text isn't embedded (only commentary is), so the teacher currently cannot find "verses about stealing." Build one or both:
- **Topical / cross-reference index** — TSK (Treasury of Scripture Knowledge) + openbible cross-references: curated verse lists per topic. Cheap, high-precision for named topics. **Recommended primary.**
- **Semantic verse search** — embed the Bible (BSB/PD, pinned BGE-large) → vector search over scripture for the long tail.

## Intent routing (the "skills" layer, concrete)

A small classifier routes each query → retrieval strategy + response shape. Keep it deterministic where possible (e.g. the "what does the Bible say about ___" pattern → topical) with an LLM classifier for the ambiguous rest. **Log the classified intent** — it feeds the topical-cache flywheel (the head topics get curated).

## Sensitive topics (product-safety requirement, not optional)

Crisis-adjacent topics — **suicide, self-harm, abuse, addiction** — must NOT return a bare verse list. The response leads with compassionate framing and **auto-surfaces crisis resources** alongside the scripture/commentary:
- **988 Suicide & Crisis Lifeline** (US — call or text 988) as the reliable baseline.
- A **verified faith-based** crisis line as a secondary resource — **do not ship a hard-coded number until it's confirmed current and reputable** (a wrong crisis number is actively harmful; accuracy here is safety-critical).

Triggered by a maintained sensitive-topic list. Someone asking "what does the Bible say about suicide" may be in distress — the resource block is mandatory, not a nice-to-have.

## Content model

**Two content categories only: Bible and commentary.** Commentary voices are drawn from the ingested public-domain corpus (church fathers + PD commentators). Do not hard-code named authors in product/sample copy — the available voices depend entirely on what's ingested and licensed.

## Sequencing

- Build **after** retrieval accuracy is at 10/10 — this is a teacher refinement, and it inherits whatever retrieval quality exists.
- The main new build is the **Type 1 verse-retrieval layer** (topical index + optional verse embedding). Type 2 already works; its only addition is scripture links below the commentary.
- Design-doc the intent classifier + the verse-retrieval approach before building (touches retrieval + the contract surface).

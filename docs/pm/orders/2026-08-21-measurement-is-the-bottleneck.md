# Build proposal — measurement is the bottleneck

> ## ⚠️ CORRECTED AFTER REVIEW (2026-08-21) — read this before the body
>
> An independent review found two factual holes, **both verified and both conceded**. The
> body below is left intact as the record; these corrections govern.
>
> **1. The centerpiece number is stale, and the miss is CLOSED.** This doc is built on
> "proper-noun stuck at 60 against a bar of 70". The post-A8 production re-run
> ([`docs/evidence/eval-v4-post-a8-2026-08-02.md`](../../evidence/eval-v4-post-a8-2026-08-02.md))
> measured **70% HIT@1, 100% HIT@2, 10/10 pass, 0 wrong, 0 none — "clears — the July miss is
> closed"** on 2026-08-02, **nineteen days before I filed this**. There is no outstanding
> gate miss. A document whose entire sermon is *check the denominator before you speak* did
> not check the newest evidence file. That is the same failure it was written to correct,
> committed while correcting it.
>
> **2. Part A step 1 was already done — while I was writing the proposal for it.**
> `.github/workflows/audit.yml:155` already reads `PARENT_BRANCH: dev`, changed 2026-08-21,
> with a comment block at 109–123 reproducing this doc's own reasoning and adding the
> measurement I did not have (15 published devotional works, 9,878 served JFB rows, 131,569
> rows in the served legal pool on dev). **Only A-2 (the `neon-auth-live` `announceSkip`
> downgrade) is outstanding.**
>
> **3. The "user impact is near zero" argument was understated against my own interest.**
> "/ask composes 2–3 voices" is the *prompt floor* (`src/teacher/prompt.ts:58`, "at least
> 2-3"). The shipped composer retrieves 6 and composes from 5
> (`web/src/lib/teacher/teach.ts:102-103`). A HIT@2 miss sits well inside the compose pool,
> so the right passage reaches the reader.
>
> **What survives:** only the narrow instrument claim — **proper-noun is n=10, so 60 and 70
> are one query apart and neither resolves the bar.** That is still true and still worth
> fixing eventually. It is NOT a blocked gate, NOT urgent, and NOT the highest-leverage work
> available. **This proposal is demoted from "the build" to "a weak instrument, worth
> strengthening when something actually depends on it."**
>
> **Two owner questions the reviewer raised that are cheaper than any labelling, and that I
> failed to ask because I treated the bars as physics:**
> - **Should the launch gate be HIT@2 rather than HIT@1**, given the composer draws from 5?
>   Every recorded miss passes at HIT@2. One ruling could obsolete ~90 labelling tasks.
> - **Is ≥99% the right `interpretation_bait` bar pre-launch?** Rule of three is the most
>   conservative instrument available; the bar itself was never interrogated here.
>
> **Also conceded:** C1 is padding (the arithmetic is already in `CLAUDE.md`; fold it into
> C2). C3 should be **deferred** pending its own costing and a ruling on the bar — §5.4
> flagged the bundling risk and then bundled anyway. And **§4's "Journeys is gated on this"
> is self-citation** — no other document states that gating; it was doing persuasive work
> and should not have been asserted.

**Filed 2026-08-21 for adversarial review. Nothing here is built by this document.**

## 0. What I got wrong first, since it is the reason this doc exists

An hour ago I told the owner the highest-value product work was **fixing proper-noun
retrieval (60 against a bar of 70)**, calling it "the product giving wrong sources to real
questions." Two things were wrong with that, and both are checkable:

1. **It is not an open question.** `ADR-028` (owner, 2026-07-19) ruled it: proper-noun
   HIT@1 60<70 is an **ACCEPTED LIMITATION for gated beta, BLOCKING for public launch,
   pending a re-measure at larger n**. The ADR says in terms: *"ADR-028 is the single place
   this status is ruled; do not restate it elsewhere."* Proposing a fix would have been
   relitigating a settled ruling.
2. **I never checked the denominator.** `proper-noun` is **n=10**
   (`HELDOUT_EVAL_DESIGN.md:121` — verse-ref 40 · pericope 15 · epistle 25 · topical 20 ·
   proper-noun 10 · control 10 = 120). "60 vs 70" is **six of ten against seven of ten —
   one query.** The 95% CI on 6/10 runs roughly 31%–83%. And all four misses **pass at
   HIT@2**, meaning the right passage is retrieved but ranked second — and `/ask` composes
   2–3 voices, so the user-facing impact is plausibly near zero.

**Why I got misled, and it will mislead the next session too:** `CLAUDE.md` — auto-loaded
every session — describes proper-noun as an "OPEN OWNER CALL". That is precisely the
restatement ADR-028 forbade. One stale parenthesis in the always-on file caused a fresh
session to spend an hour re-deriving a decision made a month ago. **Fixing that line is the
highest ratio of value to effort in this document.**

The owner's own ruling already contains the correct remedy: *"gating on a statistically
unmeasurable number is theater; the honest instrument fix (a larger held-out)."* This
proposal is that instrument fix, nothing more.

---

## 1. The thesis

**This product's binding constraint is not capability. It is measurement.**

Two gates are stuck, and neither is stuck because the system underperforms:

| Gate | State | Why it is stuck |
|---|---|---|
| proper-noun HIT@1 (public-launch blocker, ADR-028) | 6/10 vs 7/10 | n=10 cannot distinguish 60% from 80% |
| `interpretation_bait` faithfulness (the product guarantee) | 100/100 clean | 0-in-100 is a **~97%** lower bound by rule of three; the gate names **≥99%**, which needs ~300 |

Same shape both times: **the sample cannot resolve the question being asked of it.** No
retrieval change can be shown to help, because the instrument cannot see a change smaller
than its own noise floor. That is `THE_LOOP.md`'s thesis stated as a number — the verifier
is the bottleneck — and it is currently true in the most literal way.

Everything downstream inherits it: public launch (ADR-028 gate), Journeys (the
dossier's centerpiece, which composes durable multi-day paths over exactly the weakest
retrieval categories), and any future retrieval tuning at all.

---

## 2. The build, in three parts

### Part A — restore CI signal (≈10 minutes, agent)

1. `.github/workflows/audit.yml:128` — `PARENT_BRANCH: ci-test-20260729` → `dev`. That
   branch was cut 2026-07-29; essentially every served row landed in August, so four
   suites assert properties of a corpus their database has never seen. Measured against
   dev today: `plan-tenancy` 6/6, `licensing` 6/6, `register-wall-surfaces` 6/6 — the
   properties hold, the CI database cannot see them.
2. `neon-auth-live` — change its `announceSkip` requirement `kind` from `secret` to
   `artifact`, so CI reports **NOT RUN** loudly rather than FAIL.

**On (2) I am reversing my own earlier proposal.** I had drafted an order to stand up a
second Neon Auth instance and wire two secrets. That was over-engineering: the test signs
up a real, undeletable user per run; auth is already proven working in production and by
daily use; and the suite **has never executed once in its life**. It is a promissory note,
not a regression guard. Downgrading it is one line and loses nothing real.

**Ceiling, stated honestly:** `main` is unprotected on this plan and `audit` is not a
required check, so none of this *blocks* anything. It buys a red light that means
something. Worth ten minutes; not worth a project.

### Part B — the one-line doc correction (≈2 minutes, agent)

Correct `CLAUDE.md`'s proper-noun parenthesis to cite ADR-028 instead of advertising an
"OPEN OWNER CALL". Prevents every future session from repeating my hour.

### Part C — the actual build: make the instrument able to answer (the real work)

**Slice C1 — size it before building it (half a day).** Compute what n each blocked
category needs to adjudicate its own bar, and write it down before any labelling starts:

- proper-noun: at n=10 the CI half-width is ~±26pts. At **n=100** it is ~±10pts — enough to
  put 70 outside the interval if the true rate is ≤60 or ≥80. Still ambiguous if the truth
  sits at 65–70, and **that must be pre-registered as a possible outcome**, not discovered
  afterwards.
- `interpretation_bait`: the arithmetic is already settled and in `CLAUDE.md` — **~300
  clean cases of NEW attack vectors**, not rephrasings, for a ≥99% claim by rule of three.

**Slice C2 — scale proper-noun first, because it is the cheapest blocking gate to scale.**
`HELDOUT_EVAL_DESIGN.md:62`: *"Verse-ref / pericope / proper-noun labels are objective
verseId ranges from Scripture."* Its labels are **objective, not judgment** — unlike
topical, where labelling is the expensive part. So the one category that blocks public
launch is also the one that scales mechanically. That is a genuine piece of luck and it is
why this slice is affordable at all.

Discipline is already specified and must be inherited verbatim: authority-grounded labels,
content-hash pinned **before** any accuracy number exists, **no relabel path** (a
correction requires a uniform re-freeze at a new hash), and run **once**. v4's own
disjointness caveat must be honoured too — v4 shares **47 of 179 labels (26%)** with v3, so
a v5 must be checked for label overlap, not just query overlap
(`scripts/check-heldout-disjoint.mjs` already does this).

**Slice C3 — `interpretation_bait` toward n≈300.** Same shape, higher stakes: this is the
product's existential promise. Deliberately sequenced last because C2 proves the labelling
pipeline on the cheaper, objective category first.

---

## 3. What the outcome will be — as falsifiable predictions

Stated so a reviewer can hold me to them:

1. After Part A, `db-invariants` goes **green**, and the four data suites **execute**
   rather than skipping. *(Falsifier: they skip. The ephemeral branch gets a new endpoint
   id per run and the seed guard allowlists endpoints by id — if that bites, five failures
   become four silent no-ops, which is worse than today. This is the specific way Part A
   can fail and it must be checked, not assumed.)*
2. After C2, proper-noun's status is **resolved**, not necessarily **passed**. A larger n
   may confirm the system is genuinely at ~60. **That is a success of this build, not a
   failure** — it converts an unmeasurable blocker into a measured one with a known
   direction, which is what ADR-028 asked for.
3. After C3, the faithfulness claim is either **earned at ≥99%** or **honestly restated**
   at whatever the evidence supports.

I am explicitly **not** predicting the numbers improve. This build buys the ability to
know. Anyone promising a lift from an instrument change is selling something.

---

## 4. The lift — why this pays forward

- **It unblocks the public-launch gate** in the only way ADR-028 permits.
- **It unblocks Journeys**, the strongest idea in the plans/studies dossier, which is
  currently gated on an accuracy bar nobody can measure. Journeys composes *durable,
  dated, multi-day paths* over topical and proper-noun retrieval — the two weakest, least
  measurable categories. Shipping it on today's instrument would mean caching wrong answers
  into a schedule, which `CLAUDE.md` forbids outright.
- **Every future retrieval change becomes decidable.** Today a change that genuinely helps
  by 8 points is invisible at n=10. This is the compounding return: it is paid once and
  every subsequent quality slice draws on it.
- **It ends a recurring failure mode.** Small-n has already produced *two* rounds of
  argument about whether a number is real (v2→v3→v4). A third is coming unless the
  instrument changes.

---

## 5. Where a reviewer should push hardest

I would attack these, in this order:

1. **Urgency.** SEC-1 (auth CVEs + the site password gate) blocks public launch
   independently, so proper-noun is not the binding constraint on launching *today*. The
   counter is lead time: labelling is long-lead, SEC-1 is not, and they parallelise. But if
   the reviewer thinks this should wait behind SEC-1, that is a defensible position and I
   will not fight it hard.
2. **Cost of C2/C3.** 90 new objective proper-noun labels plus ~200 genuinely novel bait
   vectors is real work, and "new vectors, never rephrasings" is the hard part of C3 — a
   rephrasing that passes proves nothing and inflates n dishonestly. There is no shortcut
   and I have not costed it in hours.
3. **Does n=100 actually settle it?** If the true rate sits at 65–70, n=100 leaves it
   ambiguous and we will have spent the effort to learn "still unclear". I flag this in C1
   rather than discovering it afterwards, but the reviewer should decide whether n=100 is
   the right target or whether it should be higher.
4. **Is C3 the same build at all?** `interpretation_bait` is a different harness on a
   different axis. Bundling it may be a false economy; it may deserve its own slice with
   its own owner decision. I have bundled it because the *shape* is identical and the
   labelling discipline transfers, but that is an argument about method, not about scope.

## 6. What is deliberately NOT in this build

- No retrieval, ranking, or corpus change of any kind. **Measure before build**
  (`quality-slice`); changing the system and the instrument together is how the v3
  circularity happened.
- No relitigating ADR-028, ADR-024 or ADR-023.
- No new Neon Auth instance (withdrawn, §2A).
- No claim that any number will improve.

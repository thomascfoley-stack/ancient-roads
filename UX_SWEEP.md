# UX_SWEEP.md — findings, overnight run on fix/ux-overnight-sweep

Format: ID · lane · severity (P0 broken / P1 user-angry / P2 friction / P3 cosmetic) · narrative · repro · expected vs actual.

## MK-13 — 🔴 P1 — no privacy policy or terms linked on the landing page

**Narrative:** A first-time visitor scrolls the whole landing page looking for what happens to the
email they're about to hand over. There is no privacy policy, no terms link, anywhere — not in the
footer, not near the waitlist form.
**Repro:** Load http://localhost:3055/ (or prod), read the full page text / footer.
**Expected:** A linked privacy policy near the waitlist form or in the footer, per standard practice
for any product collecting emails + running analytics (PostHog is wired in per docs/ENVIRONMENT.md).
**Actual:** Footer text confirmed (get_page_text dump, 2026-08-23 tonight): "PRODUCT / HOME / FEATURES
/ WHY / MORE / ABOUT / LOG IN / © 2026 ANCIENT PATHS / CRAFTED WITH REVERENCE" — no privacy/terms link
anywhere in the rendered text. This matches the ledger's own pre-registered MK-13 prediction exactly.
**Confidence:** single-agent observation, not yet independently reproduced (P1 requires 2nd-agent
confirmation before it counts per the ledger's own rule — flagging for morning re-check, this is
real enough content-wise that I'm logging it now rather than losing it).


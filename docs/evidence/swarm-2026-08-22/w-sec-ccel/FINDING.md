# W-SEC-CCEL — finding + intent resolution (2026-08-23)

## The defect
`web/src/components/history-results.tsx:76` — the "Copy citation" button copies
`${work.author}, ${work.title}, ${headingPath} (CCEL)` for EVERY work, regardless of the
source record. The served history shelf is not all CCEL.

## Live proof (dev DB, ep-tiny-hat, read-only, 2026-08-23)
sources row for the one published historian on dev:
  slug    = josephus-whiston
  edition = "The Complete Works of Josephus, tr. William Whiston 1737 (CrossWire SWORD module Josephus, RawGenBook/ThML)"
  url     = https://crosswire.org/sword/modules/ModInfo.jsp?modName=Josephus
A citation copied for this work asserts "(CCEL)" — false provenance on an attribution control.

## Intent resolution (the WORKLOG entry names no replacement)
WORKLOG 2026-08-21 (~line 1857) lists only "`(CCEL)` hardcoded provenance" — no intended
replacement string. The order's parenthetical says "derive from the source record".
Two candidate replacements were weighed against the repo's RULED policy:

- GO_LIVE A5 ("attribute to the author, never a host"), applied in
  commentary-panel.tsx:331-341: "provenance keeps the URL for the record; the UI shows the
  work title, plain."
- web/src/lib/work.ts:11 + work-header.tsx:5: `provenance` (host URLs) is NEVER selected
  server-side "so no host URL can reach a response" — a deliberate response whitelist.
- The canonical copy idiom (web/src/lib/copy-format.ts, the reader's selection popover)
  attributes author/work label only — no host tag on any copy path.

Piping a provenance-derived host/edition tag to the client would contradict A5 and the
whitelist, and the edition strings themselves name hosts ("(CrossWire SWORD module…)").
So "derive from the source record" is satisfied the only policy-compliant way: the copied
citation carries EXACTLY what the source record supports — author, title, heading path —
and the hardcoded host assertion is deleted (§2.5: deletion is an allowed remedy).
If the owner wants a truthful provenance label surfaced, that is a design change against
the whitelist and is theirs to rule.

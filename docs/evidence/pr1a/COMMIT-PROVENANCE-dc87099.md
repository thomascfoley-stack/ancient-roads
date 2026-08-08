# Provenance correction — `dc87099`

`dc87099` is titled *"F2: delete the dead Better Auth system; preserve the live checks inside it"*
and its message describes only that. **It also contains two unrelated changes, from the owner's
other two rulings of 2026-08-08**, which its message does not mention:

| File | Change | Belongs to |
|---|---|---|
| `docs/UX_REMEDIATION.md` (+113) | The `F1-fonts` block; F1's Backlog entry promoted; the `PR1a` carry-forward coupling section | Ruling 2 and ruling 3 |
| `web/src/components/sidebar.tsx` (+20) | The load-bearing warning at `storageKey` | Ruling 3 |

**Cause: `git add -A web/src web/test docs/…`.** Staging by directory swept in every modified file
under those paths, including two written for a different ruling and intended for a separate commit.
`git add` by *name* would not have. **This is the second instance in this session** — the first was
`git add -A docs/`, which swept four of another session's untracked files into `e9bdd5b` and was
corrected the same way at `a8e432c`. Twice is a habit, not an accident: **stage by name in this
repo.**

Not corrected by rewriting history — `dc87099` was already pushed, and a force-push to fix a
commit message costs more than it buys. The record is corrected here instead.

## The message those changes should have carried

**`F1-fonts` — promoted from Backlog to its own block.** Self-host via `next/font`; **no CSP
widening** (owner-ruled). Written up with the masking explanation, because *why it survived every
audit* is more useful than the finding itself: the defect is invisible on exactly the machines that
would catch it. The stack falls back to Georgia/Times, and the people auditing tend to have EB
Garamond and Literata installed locally — they were chosen by someone who had them — so the page
looks right and the CSP block appears only in console noise. The obvious probe agrees with the
wrong answer too: `document.fonts.check()` returns `true` for a nonsense family, because it answers
"can this render", which a fallback always satisfies. The block names the two checks that actually
settle it, and makes X5 *"verify on a machine without the fonts installed"* — otherwise the check
cannot fail, which is how this survived in the first place.

**The carry-forward coupling — flagged at `sidebar.tsx`'s `storageKey`**, where someone doing the
cleanup would actually be looking, not only in the block. The once-only guard and the surviving
`localStorage` key are **one decision**. The guard never retries a half-run because a duplicate is
worse than a miss — someone's words twice, with no way to tell which is real. That trade is only
acceptable while the source survives, so "a miss" means "recoverable" rather than "gone". Delete
the key and the same unchanged code becomes data loss, with nothing going red: the module's own
test guards only against it removing *its own* source and cannot see a `removeItem` added
elsewhere. A reconciliation pass must exist before that key goes.

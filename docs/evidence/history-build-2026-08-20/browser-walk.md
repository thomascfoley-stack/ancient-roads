# History UI browser walk — 2026-08-20, dev (ep-tiny-hat), signed out

**Desktop (1280-class):** `/ask?mode=history` renders stage 0/1 to the wireframe — [Voices|History]
toggle (History active), placeholder, contract line, three example chips. **Real interaction
end-to-end:** clicked "tell me about Herod" → input filled → submitted → `401` handled as the fixed
string "Please sign in to search history. Retry" — a message, never an error card. The 401 path
itself was a gap FOUND BY PREPARING THIS WALK and fixed before it.

**Mobile (375×812 preset):** renders clean — toggle centered, chips wrap to two rows, tab bar
intact. **Horizontal overflow measured programmatically: scrollWidth 375 = clientWidth 375, none.**
Tap-to-activate was flaky IN THE EMULATOR (mouse→touch translation produced text selection; ref
clicks timed out) — the identical buttons work at desktop, so this is recorded as a tool artifact,
not a surface defect. Real-device tap is a DEVICE check by the repo's own taxonomy.

**Console:** two pre-existing errors, neither from this build — the auth route 500s on dev
(`NEON_AUTH_BASE_URL` unset in web/.env.local, which carries only DEEPINFRA_API_KEY +
APP_DATABASE_URL) and React dev-mode `eval()` vs the app CSP.

**Walk also caught, before any user could:** the `zod` build failure (typecheck resolved it from
the monorepo root; Next could not — dependency removed in favor of edge narrowing), and the dev
server serving the WORKTREE branch while commits landed on fix/q1-signed-out-state (synced).

**NOT covered, stated:** the authenticated results render in a real browser — dev has no auth env
and no session bypass, and account creation/password entry is outside my rails. Covered instead by
5 jsdom component tests (mutation-red-proofed) + the live-DB scope test (historian-only, verbatim
excerpts). The authenticated browser pass happens on prod post-deploy (owner + independent review).

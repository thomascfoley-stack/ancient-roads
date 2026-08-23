# W-SEC1 — memo for the owner-return packet

**One-paragraph brief (SEC-1 code state).** The dependency exposure behind SEC-1 is closed
in the tree by version: Neon shipped `@neondatabase/auth@0.5.0-beta`, which depends on
`better-auth@1.6.23`, and branch `swarm/w-sec1-dependency-truth` bumps to it. `deps-audit`
goes from red (GHSA-g38m account-takeover, GHSA-qq9h pre-account hijack — both HIGH, both on
the old `better-auth@1.4.18` pin) to zero un-ignored high/critical across 512 prod packages,
and `scripts/audit.sh`'s `--expect-red` declared set is empty for the first time since
2026-08-11. **What remains the owner's:** (1) the public-launch decision itself — the
in-tree code state is green, but Neon's *hosted* better-auth server version is still
unobservable from this repo, and the `Verify at Sign-up` console toggle (owner-attested ON
2026-08-08) is still the mitigation nothing here can observe — re-attest before relying on
it; (2) whether to keep branch `fix/sec1-better-auth-1-6-25` (moot — pnpm-override approach,
superseded by the upstream release; recommend delete); (3) deploy timing — auth against a
live Neon instance has never been exercised in test (`neon-auth-live` is withheld by
design), so exercise the bump on dev before shipping it. Evidence:
`docs/evidence/swarm-2026-08-22/w-sec1/baseline-red.md`; item file:
`docs/pm/swarm-2026-08-22/items/w-sec1.md`.

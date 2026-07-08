# Auditing

## `npm run audit` — the gate (run before pushing)
Runs, failing if any fails:
1. **typecheck** — `tsc --noEmit` (strict)
2. **lint** — ESLint over `src/` and `test/`
3. **unused** — knip (unused files, exports, dependencies)
4. **deps** — `pnpm audit --audit-level=high` (fails on high/critical CVEs)
5. **tests + coverage** — `vitest run --coverage`
6. **coverage gaps** — prints source files with zero coverage (informational)

Use `npm run audit` or `corepack pnpm run audit` — **not** `pnpm audit` (that's pnpm's own CVE command, not this script).

The **deps** gate runs `pnpm audit --prod --audit-level=high`. Nine HIGH/CRITICAL advisories are allowlisted in `package.json` → `pnpm.auditConfig.ignoreGhsas`, all rooted in the pinned `@neondatabase/auth` beta and unfixable today (see **[docs/SECURITY.md](docs/SECURITY.md) → SEC-1**). The `vitest` UI-server CVE is allowlisted permanently (dev-only, headless). The rest are **not accepted** — they are a tracked launch blocker; remove them from the ignore list when the auth dependency is fixed so any regression re-reds the gate.

## CI — `.github/workflows/audit.yml` (enforced)
Runs the audit on every PR and every push to `main`. Make it actually block merges and lock down the repo — three GitHub settings:

1. **Require the check:** Settings → Branches → add a branch-protection rule for `main` → **Require status checks to pass before merging** → select **audit**.
2. **Secret scanning:** Settings → Code security and analysis → enable **Secret scanning**.
3. **Push protection:** in the same section, enable **Push protection** — this blocks commits that contain secrets *before* they land (backstops the `pnpm audit` + Dependabot supply-chain layer).

`.github/dependabot.yml` opens weekly PRs for vulnerable/outdated deps (root, `web/`, and the Actions themselves).

## `/audit` — adversarial review (on demand)
Skeptical senior-engineer review of your branch diff for slop against CLAUDE.md. `/audit` reviews the whole branch; `/audit src/retrieval` scopes to paths. Use before opening a PR.

## `/security` — security pass (on demand)
Authorization / RLS / uploads / SQL / secrets review. `/security` reviews the auth + data-access layers; `/security <paths>` scopes it. Use whenever you touch auth, API routes, DB access, or uploads.

## Which when
- **Every change:** `npm run audit` locally; CI enforces it.
- **Logic-heavy change / before a PR:** also `/audit`.
- **Anything touching auth, user data, uploads, or SQL:** also `/security`.

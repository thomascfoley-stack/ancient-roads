---
description: Security & authorization pass (OAuth, RLS, per-user data, uploads)
argument-hint: "[file paths…]"
---
Review the paths in `$ARGUMENTS` if given; otherwise review the auth and data-access layers:
`web/src/lib/auth/`, `web/src/lib/session.ts`, `web/src/lib/db.ts`, `web/src/lib/annotations.ts`, `web/src/app/api/`, and `db/schema.sql`.

You are a security engineer auditing this code for a consumer app serving many users. Find vulnerabilities, ordered by severity. Check specifically: every data query and mutation enforces per-user authorization (not just authentication); Postgres RLS is actually enforced on user-scoped tables, not merely defined; file uploads validate type, size, and content; no user input is concatenated into SQL; public endpoints are rate-limited; secrets aren't logged or exposed to the client; and one user can never read or mutate another user's rows.

For each finding: `file:line`, the exploit, and the fix. Output only findings.

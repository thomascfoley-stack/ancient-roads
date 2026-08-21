import 'server-only';

/**
 * WHO MAY REACH THE TEACHER (ADR-116 ruling 3, gated beta).
 *
 * `interpretation_bait` is 100/100 clean, which by rule of three is a ~97% lower bound — honest
 * evidence for ~97%, not for the >=99% bar the gate names. Until ~300 clean NOVEL vectors earn
 * that bar, the compose path is owner-only. The site password gate does not provide this: a beta
 * user has the password by definition.
 *
 * FAIL-CLOSED. An unset or empty `TEACHER_ALLOWLIST` admits NOBODY, including the owner. The
 * alternative — unset meaning "everyone" — would silently reopen this surface the first time a
 * deploy forgot an env var, i.e. it would fail open exactly when someone made a mistake. A
 * disabled teacher is a safe thing to be; an accidentally public one is not.
 *
 * Entries are matched as EXACT tokens against the caller's email and user id (case-insensitive,
 * whitespace-trimmed) — never as substrings, which would let `owner@example.test.attacker.com`
 * satisfy `owner@example.test`. Id is accepted as well as email so that changing the owner's
 * email address cannot lock them out of their own product.
 */
function allowlist(): ReadonlySet<string> {
  const raw = process.env.TEACHER_ALLOWLIST ?? '';
  return new Set(
    raw
      .split(',')
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function isTeacherAllowed(user: { id: string; email: string }): boolean {
  const allowed = allowlist();
  if (allowed.size === 0) return false; // fail closed — see the note above
  return allowed.has(user.email.trim().toLowerCase()) || allowed.has(user.id.trim().toLowerCase());
}

---
description: Adversarial code review of the diff against our CLAUDE.md rules
argument-hint: "[file paths…]"
---
Determine the diff to review:
- If `$ARGUMENTS` is non-empty, review only those paths: `git diff main -- $ARGUMENTS`
- Otherwise review the whole branch: `git diff main...HEAD`

You are reviewing this code as a skeptical senior engineer who did NOT write it. Find slop against our CLAUDE.md rules. For each finding report `file:line`, why it's a problem, and the minimal fix. Flag specifically: any/loose types; functions doing more than one thing; premature abstraction (interface/config/param with one real call site); dead or unreachable code; DB queries missing a LIMIT or an index; N+1 patterns; swallowed or empty catch blocks; unvalidated external input at boundaries; anything a junior couldn't follow in one read; and tests that mock so heavily they assert nothing.

Do NOT praise. Do NOT summarize what the code does. Output only findings, ordered most to least serious.

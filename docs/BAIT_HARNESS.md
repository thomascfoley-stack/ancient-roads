# Faithfulness (interpretation_bait) harness — permanent

Re-runs the `interpretation_bait` suite through the **real `teach()`** compose→verify pipeline, so the
faithfulness guarantee can be re-measured **live on demand** — which the CLAUDE.md DoD requires after every
retrieval change (changing what's retrieved changes what's composed). Replaces the earlier throwaway unauthed
endpoint; this one is **permanent and secret-authenticated** — no hole is opened.

## Pieces
- **`web/src/app/api/eval/bait/route.ts`** — POST endpoint that runs `teach(question)` and returns the
  `TeacherResult`. Gated by `EVAL_HARNESS_SECRET` (server-only): **missing secret ⇒ 503 (fail closed)**,
  wrong/absent Bearer token ⇒ 401, constant-time compare. In production it also sits behind the SITE_PASSWORD
  gate, so it is double-gated there.
- **`src/evals/run-bait.mts`** — runner: reads `evals/cases/interpretation_bait.yaml`, POSTs each prompt with
  the Bearer secret, classifies each result (composed / fallback / empty), scans composed assistant-voice text
  with the production `runScreens` **plus** a wider adversarial net, and reports `faithfulness = (n − breaches)/n`.
  A breach = a production-screen leak in a composed (verifier-passed) answer that reached the user.

## Run it
```bash
# 1. Secret must be in web/.env.local (generated once; gitignored; never printed):
#    EVAL_HARNESS_SECRET=<64 hex chars>
# 2. Start the dev server (loads web/.env.local): preview theology-dev  (or: cd web && npx next dev)
# 3. Run against it:
PORT=<dev-port> npx tsx --env-file=web/.env.local src/evals/run-bait.mts
```
Exit code is non-zero if any production-screen leak reached the user. Target: **0 breaches** — but note the 35-case fixture certifies only a **~92% lower bound** (rule of three, n=35); claiming **≥99%** needs ~300 clean cases.

## Notes
- The secret lives only in `web/.env.local` (local) — set it in the target env (e.g. Vercel) if ever running
  the harness against a deployed server. It is never committed or logged.
- Baseline through the current shipped pipeline (2026-07-11): **35/35 = 100%**, 0 breaches, 0 wide-net flags.

# Owner decisions needed — UX sweep continuation

Tabled, not acted on. Each row is a question only the owner can answer; the sweep moved past it.
Nothing here blocks the rest of the testing.

| # | Decision | Why it is the owner's | What is blocked |
|---|---|---|---|
| D-1 | **A test mailbox, or accept that the three verification-link tests stay untested.** Sign-up mails a verification link whose URL format is not defined in this repo (it comes from the hosted Neon Auth server). Without one real received email, AU-020/021/022 cannot be run. | Needs a real address the owner controls, or a mail-catcher wired into the Neon Auth project | AU-020, AU-021, AU-022 |
| D-2 | **Is email verification required for beta at all?** `auth-forms.tsx` says in a comment this is still open. It changes what AU-004/019/020-022 are even testing, and it is the reason a dev test account needed a manual `emailVerified` flip to be usable. | Product call | The shape of the whole AU verification group |
| D-3 | **Google OAuth on a local/dev origin.** Google sign-in cannot be exercised on `localhost:3010` unless that origin is a registered redirect URI in the Google project. | Owner holds the Google project | AU-028, AU-029, and re-testing F-075 |
| D-4 | **Real-device coverage (21 items).** iOS/Android hardware and a non-Chromium browser. `CLAUDE.md`'s own rule says an agent may not mark `DEVICE` checks. | Rule is explicit | the 21 PENDING-DEVICE rows |
| D-5 | **A screen reader.** VoiceOver/NVDA judgement, not a DOM/ARIA proxy. | Needs a person listening | AX-002, AX-005, SE-032, NT-026, PL-022, HL-025 |
| D-6 | **F-108's stranded test plan on the production account.** The previous pass left one disposable plan (`/plans/959dc6bc-…`, "Romans · 3 weeks", 0/15 days read) that cannot be deleted because deleting it is the bug. Delete it in the DB, or leave it until F-108 is fixed. | Production write | Nothing; it is inert |

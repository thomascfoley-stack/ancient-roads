import { redirect } from 'next/navigation';

// N4 — the old Channels route. RULED 2026-08-08: REDIRECT, not 404.
//
// This used to render a `ComingSoon` placeholder telling the reader that group study spaces "are
// being built". That is the fake door the block exists to close: the sidebar invited people to
// create a channel, creating one succeeded, and the URL they were given led to an apology.
//
// A 404 was considered and ruled against. These URLs exist because the product told readers to
// make them, and a dead end they cannot act on punishes them for using a feature we shipped. A
// redirect lands them where the concept actually moved — the prayer journal (`PR1a`), which is the
// real feature behind the shell Channels always was. Nothing they created is lost: `PR1a`'s
// first-launch carry-forward migrates the items into the journal.
//
// The dynamic segment is intentionally ignored. Every channel id resolves to the same destination,
// because no channel ever had content — the route only ever rendered a placeholder.

export default function ChannelPage() {
  redirect('/prayers');
}

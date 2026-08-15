// THE PRAYER COMPOSE VIEW OWNS THE SCREEN (owner direction 2026-08-12, journal-redesign
// mockup: "the journal area is the screen, not a widget on it"). While it is open, the sidebar
// drops to a 58px icon rail and re-expands on hover or ⌘\.
//
// The signal is a body data attribute plus a window event, NOT React context: the compose view
// lives in the `/prayers` page and the sidebar in the root layout's AppShell, and a context
// bridge between them would put prayer state in the shell of every page. The event keeps the
// sidebar's listener reactive; the attribute keeps a late-mounting sidebar correct on its first
// read. Both sides import the constants from here — a hand-typed string on each side is the
// "hand-maintained expected set" failure this repo has paid for fifteen times.

export const PRAYER_WRITING_EVENT = 'prayer-writing-change';

export function setPrayerWriting(on: boolean): void {
  if (typeof document === 'undefined') return;
  if (on) document.body.dataset.prayerWriting = 'true';
  else delete document.body.dataset.prayerWriting;
  window.dispatchEvent(new Event(PRAYER_WRITING_EVENT));
}

export function isPrayerWriting(): boolean {
  return typeof document !== 'undefined' && document.body.dataset.prayerWriting === 'true';
}

// ONE name per library route, for every surface that names it.
//
// WHY THIS MODULE EXISTS. The same routes were named by hand in three places — the sidebar
// (`components/sidebar.tsx`), the Library hub's "Yours" row (`app/library/page.tsx`) and each
// page's own heading — and by 2026-08-16 all three had drifted:
//
//   /library/notes    sidebar "Saved"       hub "Notes"        page <h1> "Saved"
//   /library/books    —                     hub "Saved"        page "My books"  (a ComingSoon stub)
//   /library/uploads  sidebar "My uploads"  hub "My uploads"   page <h1> "My Works"
//
// So "Saved" named TWO different destinations depending on which nav you used, one of which was a
// stub, and the feature the Slice 1 order names "My Works" was advertised as "My uploads" by both
// navs. A QA fleet session filed the mismatch set as "sidebar labels do not match the pages they
// open"; it is really one defect — three hand-maintained copies of a name.
//
// This is the repo's most-repeated failure class (MASTER.md's watchlist: "a hand-maintained
// expected set that nothing enforces"), and it is closed here the way the others were — by
// DERIVATION. Every surface reads the label from this map, so two surfaces cannot disagree: there
// is only one string. `test/invariants/library-nav-labels.test.ts` holds the remaining edge, which
// derivation alone cannot: that each page's own heading is the same string its nav entry uses.
//
// NAMING IS NOT RE-LITIGATED HERE (CLAUDE.md, UX_REMEDIATION §2). Each value below is the name the
// destination ALREADY gave itself; where a nav disagreed with a page, the PAGE won:
//   * "My Works" is owner-confirmed in the Slice 1 order and cited at library/uploads/page.tsx:3-9.
//   * "Saved" is what /library/notes has always titled itself.
//   * "My books" is what the /library/books stub titles itself.
export const LIBRARY_LABELS = {
  '/library/notes': 'Saved',
  '/library/books': 'My books',
  '/library/uploads': 'My Works',
  '/library/word-study': 'Word study',
  '/library/passages': 'Passage search',
} as const;

export type LibraryRoute = keyof typeof LIBRARY_LABELS;

/** The label for a route, by its href. Typed so a renamed/removed route fails the build. */
export function libraryLabel(href: LibraryRoute): string {
  return LIBRARY_LABELS[href];
}

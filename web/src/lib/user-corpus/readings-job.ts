// The suggested-readings job: run the search, write progress, store the answer.
//
// Runs OFF the request path via `after()`, like the ingestion drain, because it takes ~49s for all
// five categories and the owner has accepted ~90s in exchange for exact results
// (docs/SUGGESTED_READINGS_DESIGN.md). A request cannot wait that long and a page must not
// recompute it to render a count.

import { LEGAL_CORPUS_FILTER } from '@/lib/teacher/routing';
import { truncateCodePoints } from '../text';
import { getDocument } from './documents';
import { replaceReadings, setReadingsState } from './readings-store';
import {
  DEFAULT_CATEGORIES,
  computeSuggestedReadings,
  sanitiseCategories,
  type ReadingCategoryId,
} from './suggested-readings';
import { corpusPredicate } from './tradition-gap';

/** The same canonical predicate the anchor join uses, imported and never re-typed (ADR-104). */
const PREDICATE = corpusPredicate(LEGAL_CORPUS_FILTER);

/**
 * Search and store. Never throws to its caller: it is invoked from `after()`, where an unhandled
 * rejection is an invisible failure, so every ending is written to the document instead.
 */
export async function runReadingsJob(
  userId: string,
  documentId: string,
  categoriesOverride?: ReadingCategoryId[],
): Promise<void> {
  try {
    const doc = await getDocument(userId, documentId);
    if (!doc) return;

    const chosen =
      categoriesOverride ??
      (doc.searchCategories && doc.searchCategories.length > 0
        ? sanitiseCategories(doc.searchCategories)
        : DEFAULT_CATEGORIES);

    if (chosen.length === 0) {
      // A real answer, not a failure: the reader switched every category off.
      await replaceReadings(userId, documentId, []);
      await setReadingsState(userId, documentId, { status: 'ready', progress: 100, step: null, error: null, doneAt: true });
      return;
    }

    await setReadingsState(userId, documentId, { status: 'running', progress: 0, step: null, error: null });

    const rows = await computeSuggestedReadings(userId, documentId, chosen, PREDICATE, async (p) => {
      await setReadingsState(userId, documentId, { progress: p.percent, step: p.step });
    });

    await replaceReadings(userId, documentId, rows);
    await setReadingsState(userId, documentId, { status: 'ready', progress: 100, step: null, error: null, doneAt: true });
  } catch (e) {
    const message = String((e as Error)?.message ?? e);
    console.error('[user-corpus] readings job failed:', message);
    // The reason reaches the reader. "Something went wrong" is what made the DOMMatrix outage take
    // three deploys to diagnose; a failed search says what failed.
    await setReadingsState(userId, documentId, {
      status: 'failed',
      step: null,
      error: truncateCodePoints(message, 300),
    }).catch(() => undefined);
  }
}

// Pure readings-state vocabulary — NO server imports, so the client component can share these
// definitions instead of retyping them. D1 happened because it retyped one of them inline.
export type ReadingsStatus = 'pending' | 'running' | 'ready' | 'failed';

/**
 * The readings state a document is left in when INGEST completes.
 *
 * D1: this used to be `'pending'`, written by the drain — and `'pending'` is also what
 * `claimReadingsStart` writes when a real job claims the document. One word, two writers,
 * opposite meanings, and the two readers disagreed forever: the claim side refused for 10
 * minutes, the UI side painted a 0% progress bar and hid the button that was the only thing
 * that could have changed the status. Now NULL — "no search has been run" — which the UI
 * already renders correctly and the claim side accepts. `claimReadingsStart` is the ONLY
 * writer of 'pending'.
 */
export const READINGS_AFTER_INGEST: ReadingsStatus | null = null;

/**
 * Does this status mean "a run is in flight"? Shared by the route, the queue and the component
 * so there is one definition of the word rather than three.
 */
export function readingsIsRunning(status: ReadingsStatus | null): boolean {
  return status === 'pending' || status === 'running';
}

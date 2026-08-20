// [ Voices | History ] — stage 0. Links, not client state: the two modes are separate surfaces
// with separate contracts (HISTORY_RETRIEVAL_DESIGN §5), and a navigation is the honest boundary.
import Link from 'next/link';

export function ModeToggle({ mode }: { mode: 'voices' | 'history' }): React.ReactElement {
  const seg = 'px-4 py-1.5 text-sm';
  const on = 'font-semibold underline';
  return (
    <div role="group" aria-label="Search mode" className="mx-auto mt-4 flex w-max rounded border">
      <Link href="/ask" aria-current={mode === 'voices' ? 'page' : undefined} className={`${seg} ${mode === 'voices' ? on : ''}`}>Voices</Link>
      <Link href="/ask?mode=history" aria-current={mode === 'history' ? 'page' : undefined} className={`${seg} border-l ${mode === 'history' ? on : ''}`}>History</Link>
    </div>
  );
}

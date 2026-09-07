'use client';
// THE BACK SELF-HEAL for /ask/<thread>.
//
// Why this exists: Next 16 copies the CURRENT route tree onto a history entry it writes with
// replaceState. The composer on /ask replaceState's the thread URL into the bar once a thread
// exists, so that entry carries the empty /ask page's tree under /ask/<id>. Pressing Back from
// the reader (/work/[slug]) restores that entry — the thread URL with the empty composer under
// it — and the reader's own scroll-persist has left nothing to recover it from. Mounted on the
// /ask page, this runs ONCE on mount: if the URL is a thread URL, router.replace() onto the same
// URL, which fetches the real thread page (query preserved; no new history entry).
//
// Mount-only by design: the effect has no deps. It must not re-run on re-render (a replace per
// render would loop), and it must never fire for /ask itself or for an id that is not a thread
// id (a replace there would loop the composer or 404).
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { isThreadId } from '@/lib/thread-id';

const THREAD_PATH_RE = /^\/ask\/([^/]+)$/;

export function ThreadRestore(): null {
  const router = useRouter();
  useEffect(() => {
    const m = THREAD_PATH_RE.exec(window.location.pathname);
    if (!m || !isThreadId(m[1])) return;
    router.replace(window.location.pathname + window.location.search);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- mount only, see the header
  }, []);
  return null;
}

import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingGround, SHEET } from '@/components/marketing/ground';

// PUBLIC page (gate.ts isPublicPath, app-shell CHROME_FREE).
//
// The takedown paragraph is the load-bearing one. This product's corpus is assembled from
// public-domain and permissively licensed editions, and the licensing research has already found
// entries whose edition was newer than its record claimed. A published, working route for
// "you are serving something you should not" is part of how that stays fixable.
export const metadata = {
  title: 'Terms of Use',
  description:
    'The terms for using Ancient Paths: what it is, what it is not, what you may do with it, and how to report a work that should not be there.',
};

const UPDATED = '16 September 2026';

export default function TermsPage() {
  return (
    <main id="main" className="relative isolate">
      <MarketingGround veil="light" />
      <MarketingNav />

      <header className="relative z-10 px-5 pb-12 pt-16 text-center sm:px-8 sm:pb-16 sm:pt-28">
        <div className="mx-auto max-w-4xl">
          <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">Terms</p>
          <h1 className="font-display text-5xl leading-tight tracking-[-0.01em] text-stone-900 sm:text-7xl">
            Terms of Use
          </h1>
          <p className="mt-6 text-micro uppercase tracking-[0.2em] text-stone-500">Last updated {UPDATED}</p>
        </div>
      </header>

      <div className="relative z-10 px-5 pb-24 sm:px-8 sm:pb-32">
        <article className={`${SHEET} mx-auto max-w-[76ch] px-6 py-14 font-serif text-lg leading-[1.8] text-stone-700 sm:px-16 sm:py-20`}>
          <p className="mb-12">
            Using Ancient Paths means agreeing to what follows. It is short, and it says what we
            actually do.
          </p>

          <h2 className="mb-8 mt-4 font-display text-3xl text-stone-900 sm:text-4xl">What this is</h2>
          <p className="mb-8">
            Ancient Paths is a concordance over a library of Christian writing that is in the public
            domain or licensed for this use. It finds what those authors wrote and shows it to you,
            quoted and attributed to the person who wrote it.
          </p>
          <p className="mb-8">
            It is not a teacher, a pastor, or a counsellor, and it does not give legal, medical or
            financial advice. It will not tell you what a verse means in its own voice &mdash; that
            is a deliberate design, not a limitation we are working around. The authors it quotes
            disagree with each other, were often wrong, and are not endorsed by us. Read them as you
            would read any book: as a person exercising judgement.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">It is a preview</h2>
          <p className="mb-8">
            The product is early and access is limited. Things will change, break, and occasionally
            go away. We do not promise it will be available at any particular moment, and we may
            change or discontinue features. Keep your own copy of anything you would be sorry to
            lose.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Your account</h2>
          <p className="mb-8">
            Keep your sign-in details to yourself; what happens under your account is your
            responsibility. You must be 13 or older. Tell us if you think somebody else is using
            your account.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Your work stays yours</h2>
          <p className="mb-8">
            The notes, studies and documents you bring remain yours. You give us only the permission
            we need to run the service for you: to store your material, index it so you can search
            it, and show it back to you. We do not publish it, sell it, or train models on it. By
            uploading something you confirm you have the right to use it that way.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Fair use of the library</h2>
          <p className="mb-8">
            Read, search, quote and cite freely &mdash; that is the point. What we ask you not to do
            is bulk-extract the corpus, scrape it with automated tools, work around usage limits,
            resell access, or try to reach other people&rsquo;s data. Those things cost us real money
            and put the service at risk for everyone else using it.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">The library, and how to report a work</h2>
          <p className="mb-8">
            Every work is included on the basis that its text is in the public domain or licensed to
            permit this use, and each carries a record of the edition it came from. Editions are
            where this gets difficult: a modern translation or a revised edition of an old book can
            carry its own copyright even when the original does not.
          </p>
          <p className="mb-8">
            If you hold rights in something we are showing, or you believe a work is wrongly
            included, write to{' '}
            <a className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="mailto:hello@ancientpaths.app">
              hello@ancientpaths.app
            </a>{' '}
            with the work and what you believe the problem is. We will take it out of circulation
            while we check, rather than argue first. That is the standing policy, and we apply it to
            ourselves: when our own review finds a doubtful edition, it comes down the same day.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Machine-written text</h2>
          <p className="mb-8">
            Quotations are reproduced verbatim from the source and checked against it before you see
            them. The short framing sentence around an answer is machine-written, and the choice of
            which sources to show is made by software. Both can be wrong. Every quotation links to
            the work it came from so you can check it, and you should.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">No warranty, and limits</h2>
          <p className="mb-8">
            The service is provided as it is, without warranties of any kind, to the fullest extent
            the law allows. We are not liable for indirect or consequential losses, and our total
            liability to you is limited to what you have paid us, which today is nothing. Some places
            do not allow these limits, in which case they apply to you only as far as local law
            permits.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Ending it</h2>
          <p className="mb-8">
            You can stop using Ancient Paths at any time and ask us to delete your account. We may
            suspend an account that is breaking these terms or putting the service at risk, and we
            will say why when we do.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Changes, and the law that applies</h2>
          <p className="mb-8">
            If these terms change, the date at the top changes too, and material changes will be
            told to anyone with an account. These terms are governed by the laws of the State of
            California, and the courts of California will hear any dispute that cannot be settled
            between us.
          </p>

          <p className="mt-16 border-t edge pt-10 text-base">
            See also the{' '}
            <Link className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="/privacy">
              Privacy policy
            </Link>
            . Anything unclear:{' '}
            <a className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="mailto:hello@ancientpaths.app">
              hello@ancientpaths.app
            </a>
            .
          </p>
        </article>
      </div>

      <MarketingFooter />
    </main>
  );
}

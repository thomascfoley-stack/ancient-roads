import Link from 'next/link';
import { MarketingNav } from '@/components/marketing/nav';
import { MarketingFooter } from '@/components/marketing/footer';
import { MarketingGround, SHEET } from '@/components/marketing/ground';

// PUBLIC page (gate.ts isPublicPath, app-shell CHROME_FREE).
//
// WRITTEN FROM THE CODE, NOT FROM A TEMPLATE. Every claim below was traced to the thing that
// makes it true — the waitlist INSERT in api/waitlist/route.ts, the PostHog config in
// instrumentation-client.ts, the private Blob store in the upload route, DeepInfra in
// lib/teacher/deepinfra.ts, RLS in lib/db.ts. A privacy policy that describes a product nobody
// built is worse than none: it is a promise with no mechanism. If you change what the product
// collects, change this page in the same commit.
export const metadata = {
  title: 'Privacy',
  description:
    'What Ancient Paths collects, who processes it, and how to have it deleted. Written from the code, in plain English.',
};

const UPDATED = '19 September 2026';

export default function PrivacyPage() {
  return (
    <main id="main" className="relative isolate">
      <MarketingGround veil="light" />
      <MarketingNav />

      <header className="relative z-10 px-5 pb-12 pt-16 text-center sm:px-8 sm:pb-16 sm:pt-28">
        <div className="mx-auto max-w-4xl">
          <p className="mb-5 text-micro font-semibold uppercase tracking-[0.3em] text-stone-700">Privacy</p>
          <h1 className="font-display text-5xl leading-tight tracking-[-0.01em] text-stone-900 sm:text-7xl">
            What we collect
          </h1>
          <p className="mt-6 text-micro uppercase tracking-[0.2em] text-stone-500">Last updated {UPDATED}</p>
        </div>
      </header>

      <div className="relative z-10 px-5 pb-24 sm:px-8 sm:pb-32">
        <article className={`${SHEET} mx-auto max-w-[76ch] px-6 py-14 font-serif text-lg leading-[1.8] text-stone-700 sm:px-16 sm:py-20`}>
          <p className="mb-8">
            Ancient Paths is a concordance: it searches a library of public-domain and permissively
            licensed Christian writing and shows you what those authors said, quoted and attributed.
            This page explains what we hold about you, who else touches it, and how to have it
            removed. It is written in plain English on purpose.
          </p>
          <p className="mb-12">
            Questions, or a deletion request:{' '}
            <a className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="mailto:hello@ancientpaths.app">
              hello@ancientpaths.app
            </a>
            .
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">What we collect</h2>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">If you join the waitlist</h3>
          <p className="mb-8">
            Your email address, the campaign parameters in the link that brought you (the{' '}
            <span className="font-sans text-base">utm_</span> values, if any), and the consent
            sentence you agreed to. That is the whole row. We use it to tell you when a place opens
            up.
          </p>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">If you create an account</h3>
          <p className="mb-8">
            Your email address, and either a password or a Google sign-in, handled for us by Neon
            Auth. We never see your password. We store your account id and email so your work
            belongs to you across devices.
          </p>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">What you make while using it</h3>
          <p className="mb-8">
            Highlights, notes, saved passages, studies, reading plans, prayers, your reading
            position, and the history of your research. This is the product: it exists so that your
            work is still there tomorrow.
          </p>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">Documents you upload</h3>
          <p className="mb-8">
            If you bring your own sermons or papers into the library, the file is stored in private
            storage that is not readable from the web, and its text is split into passages and
            turned into numeric vectors so it can be searched. Both the text and the vectors are
            scoped to your account by the database itself, not merely by our code.
          </p>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">Questions you ask</h3>
          <p className="mb-8">
            We keep the question, which sources were retrieved, whether the answer passed our
            verifier, and how long it took. We read these to find bad answers and fix the retrieval
            behind them. They are not used to build a profile of you.
          </p>

          <h3 className="mb-3 mt-10 font-display text-2xl text-stone-900">Analytics and logs</h3>
          <p className="mb-8">
            We use PostHog to see which parts of the product get used. We disable its feature-flag
            requests and strip search and question text out of the page addresses it records, so
            what you asked does not travel into analytics. Our server logs deliberately leave email
            addresses out; they record the shape of an event, not the person.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Who else touches it</h2>
          <p className="mb-8">
            We are a small operation and we rent our infrastructure. These companies process data on
            our behalf, under their own security terms:
          </p>
          <ul className="mb-8 space-y-3 pl-6">
            <li className="list-disc"><strong className="font-sans text-base font-semibold text-stone-900">Vercel</strong> &mdash; hosting, and private file storage for uploads.</li>
            <li className="list-disc"><strong className="font-sans text-base font-semibold text-stone-900">Neon</strong> &mdash; the database, the accounts service behind sign-in, and the email that verifies your address.</li>
            <li className="list-disc"><strong className="font-sans text-base font-semibold text-stone-900">DeepInfra</strong> &mdash; turns text into search vectors, and writes the short framing sentence around quoted answers.</li>
            <li className="list-disc"><strong className="font-sans text-base font-semibold text-stone-900">PostHog</strong> &mdash; product analytics.</li>
          </ul>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Cookies</h2>
          <p className="mb-8">
            Three, and no advertising cookies at all. One remembers that you entered the preview
            password. One keeps you signed in. One is PostHog&rsquo;s analytics cookie. Blocking the
            third costs you nothing; blocking the first two means the site cannot tell it is you.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">What we do not do</h2>
          <p className="mb-8">
            We do not sell your data, and we do not run advertising. We do not train any model on
            your documents or your questions &mdash; your text is sent to DeepInfra only to answer
            your own request or to make your own library searchable, and it is not ours to teach
            with. We do not read your private notes except where you ask us for support and we need
            to look at the thing that is broken.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Keeping and deleting</h2>
          <p className="mb-8">
            We keep your account and your work until you ask us to delete it. Inside the product you
            can delete individual documents, studies, plans and notes yourself. To have the whole
            account and everything in it removed, email{' '}
            <a className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="mailto:hello@ancientpaths.app">
              hello@ancientpaths.app
            </a>{' '}
            from the address you signed up with and we will do it, normally within a few days. Ask
            and we will send you a copy of what we hold first.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Security</h2>
          <p className="mb-8">
            Traffic is encrypted in transit. Your rows are separated from other people&rsquo;s inside
            the database itself, so a bug in our code is not on its own enough to show your work to
            somebody else. Uploads go to a private store, not a public one. No system is perfect; if
            something ever goes wrong that affects you, we will tell you rather than hope you do not
            notice.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Children</h2>
          <p className="mb-8">
            Ancient Paths is not aimed at children under 13, and we do not knowingly collect their
            information. If you believe a child has created an account, write to us and we will
            remove it.
          </p>

          <h2 className="mb-8 mt-20 font-display text-3xl text-stone-900 sm:text-4xl">Changes</h2>
          <p className="mb-8">
            If this changes, the date at the top changes with it, and material changes will be
            mentioned to anyone with an account rather than quietly edited in.
          </p>

          <p className="mt-16 border-t edge pt-10 text-base">
            See also the{' '}
            <Link className="underline decoration-accent-600/40 underline-offset-4 hover:text-stone-900" href="/terms">
              Terms of Use
            </Link>
            .
          </p>
        </article>
      </div>

      <MarketingFooter />
    </main>
  );
}

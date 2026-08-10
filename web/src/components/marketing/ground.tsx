import Image from 'next/image';

// THE GROUND (2026-08-08 owner direction, after the static-site exploration): one
// photograph — the purchased iStock hillside path — fixed behind every marketing
// surface, showing through a translucent parchment veil, with the page's content
// floating over it on frosted sheets. "The original image transparent in the
// background with everything over it."
//
// `fixed inset-0` keeps the photograph still while the page scrolls past — the
// content moves over the land, the land does not scroll away. The veil sets how
// much photograph reads through; the hero areas use `veil="light"` so the image
// carries the moment, dense reading surfaces sit on their own frosted sheets and
// take `veil="strong"` pages.
export function MarketingGround({ veil = 'light' }: { veil?: 'light' | 'strong' }) {
  return (
    <div aria-hidden className="fixed inset-0 -z-10">
      <Image
        src="/marketing/hero-path.jpg"
        alt=""
        fill
        priority
        sizes="100vw"
        quality={85}
        className="object-cover object-[38%_55%]"
      />
      <div
        className={`absolute inset-0 ${
          veil === 'light'
            ? 'bg-linear-to-b from-stone-50/20 via-stone-50/45 to-stone-50/70'
            : 'bg-stone-50/75'
        }`}
      />
    </div>
  );
}

// The frosted parchment sheet content floats on. One class string, not a component:
// sheets wrap wildly different content, and a className is the honest interface.
// Arbitrary radius + shadow values on purpose: the app-side PRD zeroes the radius
// ladder and the shadow tokens globally, which silently flattened `rounded-3xl` and
// `shadow-sheet` to nothing. The marketing tier's softness must not depend on tokens
// another surface owns.
export const SHEET =
  'rounded-[1.75rem] border border-stone-50/60 bg-stone-50/80 backdrop-blur-xl shadow-[0_1px_2px_rgba(43,33,25,0.05),0_8px_24px_-8px_rgba(43,33,25,0.10),0_32px_80px_-24px_rgba(43,33,25,0.16)]';

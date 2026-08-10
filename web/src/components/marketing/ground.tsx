// THE GROUND (2026-08-08 owner direction, after the static-site exploration): one
// photograph — the purchased iStock hillside path — fixed behind every marketing
// surface, showing through a translucent parchment veil, with the page's content
// floating over it on frosted sheets. "The original image transparent in the
// background with everything over it."
//
// A CSS background-image on purpose, NOT next/image. Two real bugs were burned here,
// both proven live: (1) a -z-10 child inside the isolated <main> painted beneath the
// body background in Chrome, and (2) with the fixed layer at z-0, Chrome composited
// the layer before next/image's async decode finished and never repainted it — the
// photograph stayed invisible on every first paint until any style poke invalidated
// the layer. Background paints do not have the decode-invalidation problem. The asset
// is a pre-sized 2560px q82 copy (hero-ground.jpg, ~825KB) so skipping the optimizer
// costs little; hero-path.jpg remains the full-resolution source.
//
// `fixed inset-0 z-0` with all content at z-10+ (nav z-40): never a negative z.
export function MarketingGround({ veil = 'light' }: { veil?: 'light' | 'strong' }) {
  return (
    <div
      aria-hidden
      className="fixed inset-0 z-0 bg-cover bg-[position:38%_55%]"
      style={{ backgroundImage: "url('/marketing/hero-ground.jpg')" }}
    >
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

import Link from 'next/link';

export function ComingSoon({
  title,
  description,
  cta,
}: {
  title: string;
  description: string;
  cta?: { label: string; href: string };
}) {
  return (
    <div className="mx-auto flex min-h-[70dvh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-display text-3xl font-medium text-stone-800 dark:text-stone-100">{title}</h1>
      <p className="mt-3 max-w-sm font-serif text-base leading-relaxed text-stone-500 dark:text-stone-400">{description}</p>
      {/* PRD §6 secondary button: ink-wash hairline that fills on hover; no shadow,
          no radius. Keeps its dark: variants — this renders inside the themed app. */}
      <Link
        href={cta?.href ?? '/library/commentaries'}
        className="mt-8 inline-flex min-h-[44px] items-center border border-stone-500 px-5 font-sans text-sm font-semibold tracking-[0.02em] text-stone-600 hover:bg-stone-500 hover:text-stone-50 dark:border-stone-400 dark:text-stone-300 dark:hover:bg-stone-400 dark:hover:text-stone-950"
      >
        {cta?.label ?? 'Browse commentaries →'}
      </Link>
    </div>
  );
}

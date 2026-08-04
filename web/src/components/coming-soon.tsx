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
      <Link
        href={cta?.href ?? '/library/commentaries'}
        className="mt-8 inline-flex min-h-[44px] items-center rounded-lg bg-paper px-5 text-sm font-semibold text-stone-700 shadow-paper transition-all duration-200 ease-gentle hover:text-accent-800 hover:shadow-float active:bg-stone-100 dark:bg-stone-800 dark:text-stone-200 dark:shadow-none"
      >
        {cta?.label ?? 'Browse commentaries →'}
      </Link>
    </div>
  );
}

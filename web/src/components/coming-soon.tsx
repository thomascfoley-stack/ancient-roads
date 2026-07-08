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
    <div className="mx-auto flex min-h-[70vh] max-w-lg flex-col items-center justify-center px-6 text-center">
      <h1 className="font-scripture text-3xl font-medium text-stone-800">{title}</h1>
      <p className="mt-3 max-w-sm text-sm leading-relaxed text-stone-500">{description}</p>
      <Link
        href={cta?.href ?? '/library/commentaries'}
        className="mt-8 rounded-full border border-stone-200 bg-white px-4 py-2 text-sm font-medium text-stone-700 shadow-sm transition-all hover:border-stone-300 hover:bg-stone-50"
      >
        {cta?.label ?? 'Browse commentaries →'}
      </Link>
    </div>
  );
}

export function Badge({
  children,
  mono = false,
  tone = 'neutral',
  title,
}: {
  children: string;
  mono?: boolean;
  tone?: 'neutral' | 'accent' | 'warn' | 'ok';
  title?: string;
}) {
  const tones: Record<string, string> = {
    neutral: 'border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] text-[hsl(var(--fg-muted))]',
    accent: 'border-[hsl(var(--accent))]/35 bg-[hsl(var(--accent-soft))] text-[hsl(var(--fg))]',
    warn: 'border-[hsl(var(--warning))]/40 bg-[hsl(var(--warning))]/10 text-[hsl(var(--warning))]',
    ok: 'border-[hsl(var(--ok))]/35 bg-[hsl(var(--ok))]/10 text-[hsl(var(--ok))]',
  };
  return (
    <span
      title={title}
      className={`inline-flex h-[15px] max-w-[104px] items-center truncate rounded-[3px] border px-1 text-[10px] leading-none ${
        mono ? 'font-mono tabular-nums' : ''
      } ${tones[tone] ?? tones.neutral}`}
    >
      {children}
    </span>
  );
}

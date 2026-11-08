export function Kbd({ children }: { children: string }) {
  return (
    <kbd className="inline-flex h-[18px] items-center rounded-[3px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-1 font-mono text-[11px] text-[hsl(var(--fg-muted))]">
      {children}
    </kbd>
  );
}

import { useAppStore } from '../store/index.ts';

export function OfflineBanner() {
  const offline = useAppStore((s) => s.offline);
  const conflict = useAppStore((s) => s.saveState === 'conflict');
  if (conflict) {
    return (
      <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--warning)/0.15)] px-3 py-1.5 text-[12px] text-[hsl(var(--fg))]">
        This project changed in another tab or device. Reload to load theirs, or keep editing and save to
        overwrite.
      </div>
    );
  }
  if (!offline) return null;
  return (
    <div className="border-b border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-3 py-1.5 text-[12px] text-[hsl(var(--fg-muted))]">
      Offline — changes are kept in this browser.
    </div>
  );
}

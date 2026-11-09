import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { nodeById } from '#shared/domain/selectors.ts';
import { useAppStore } from '../../store/index.ts';
import { categoryTint } from '#shared/catalog/visuals.ts';

const TONE: Record<string, { border: string; bg: string }> = {
  neutral: { border: 'hsl(var(--border-strong))', bg: 'hsl(var(--surface-2) / 0.45)' },
  accent: { border: 'hsl(var(--accent) / 0.55)', bg: 'hsl(var(--accent) / 0.05)' },
  muted: { border: 'hsl(var(--border))', bg: 'hsl(var(--surface-2) / 0.3)' },
};

function GroupNodeViewInner({ data }: NodeProps) {
  const nodeId = (data as { nodeId: string }).nodeId;
  const node = useAppStore((s) => nodeById(s.project).get(nodeId));
  if (!node || node.kind !== 'group') return null;

  const tone = TONE[node.tone] ?? TONE.neutral!;
  const kindLabel =
    node.groupKind === 'site'
      ? 'site'
      : node.groupKind === 'rack'
        ? 'rack'
        : node.groupKind === 'zone'
          ? 'zone'
          : 'frame';

  return (
    <div
      className="relative h-full w-full rounded-[10px] border border-dashed"
      style={{ borderColor: tone.border, background: tone.bg }}
    >
      <div className="absolute -top-[9px] left-3 flex items-center gap-1.5 bg-[hsl(var(--bg))] px-1.5">
        <span className="text-[10.5px] font-medium uppercase tracking-[0.08em] text-[hsl(var(--fg-muted))]">
          {node.label}
        </span>
        <span className="text-[10px] text-[hsl(var(--fg-subtle))]">{kindLabel}</span>
        {node.failureDomain ? (
          <span
            className="rounded-[3px] border px-1 text-[9.5px] uppercase tracking-wide"
            style={{
              borderColor: categoryTint({ category: 'security' }, 0.6),
              color: 'hsl(var(--fg-muted))',
            }}
            title="Failure domain: losing this group takes everything inside down"
          >
            fd
          </span>
        ) : null}
      </div>
    </div>
  );
}

export const GroupNodeView = memo(GroupNodeViewInner);

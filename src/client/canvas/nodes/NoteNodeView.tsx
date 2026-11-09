import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { nodeById } from '#shared/domain/selectors.ts';
import { useAppStore } from '../../store/index.ts';

function NoteNodeViewInner({ data }: NodeProps) {
  const nodeId = (data as { nodeId: string }).nodeId;
  const node = useAppStore((s) => nodeById(s.project).get(nodeId));
  if (!node || node.kind !== 'note') return null;

  return (
    <div className="flex h-full w-full flex-col rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 py-2.5">
      <div className="mb-1 text-[11px] font-medium uppercase tracking-[0.06em] text-[hsl(var(--fg-subtle))]">
        {node.label}
      </div>
      <div className="whitespace-pre-wrap text-[12px] leading-[17px] text-[hsl(var(--fg-muted))]">
        {node.text}
      </div>
    </div>
  );
}

export const NoteNodeView = memo(NoteNodeViewInner);

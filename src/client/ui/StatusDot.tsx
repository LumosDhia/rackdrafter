import type { NodeStatus } from '#shared/domain/types.ts';

const color: Record<NodeStatus, string> = {
  planned: 'bg-transparent border-[1.5px] border-[hsl(var(--border-strong))]',
  running: 'bg-[hsl(var(--ok))] border-transparent',
  degraded: 'bg-[hsl(var(--warning))] border-transparent',
  broken: 'bg-[hsl(var(--danger))] border-transparent',
  retired: 'bg-[hsl(var(--fg-subtle))] border-transparent',
};

export function StatusDot({ status }: { status: NodeStatus }) {
  return <span className={`inline-block h-2 w-2 rounded-full border ${color[status]}`} title={status} />;
}

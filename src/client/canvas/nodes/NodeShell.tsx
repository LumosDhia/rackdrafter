import { Handle, Position } from '@xyflow/react';
import type { CatalogItem } from '#shared/catalog/types.ts';
import { categoryTint } from '#shared/catalog/visuals.ts';
import type { NodeStatus } from '#shared/domain/types.ts';
import { Badge } from '../../ui/Badge.tsx';
import { IconTile } from '../../ui/IconTile.tsx';
import { StatusDot } from '../../ui/StatusDot.tsx';

const handles = [Position.Top, Position.Right, Position.Bottom, Position.Left];

export interface NodeBadge {
  text: string;
  mono?: boolean;
  tone?: 'neutral' | 'accent' | 'warn' | 'ok';
}

export function NodeShell({
  item,
  label,
  sublabel,
  badges = [],
  status,
  width = 232,
  collapsed,
}: {
  item?: Pick<CatalogItem, 'slug' | 'category' | 'icon'>;
  label: string;
  sublabel?: string;
  badges?: NodeBadge[];
  status: NodeStatus;
  width?: number;
  collapsed?: boolean;
}) {
  const shown = badges.slice(0, 2);
  const extra = badges.length - shown.length;

  return (
    <div
      className={`node-shell relative flex items-start gap-2.5 rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-2.5 py-2 ${
        status === 'retired' ? 'opacity-60' : ''
      }`}
      style={{ width, boxShadow: 'var(--shadow-sm)' }}
    >
      {handles.map((pos) => (
        <Handle key={pos} id={pos} type="source" position={pos} isConnectable />
      ))}

      <span
        className="absolute left-0 top-2 h-[calc(100%-16px)] w-[2px] rounded-r-full"
        style={{ background: item ? categoryTint(item, 0.85) : 'hsl(var(--border))' }}
        aria-hidden="true"
      />

      {item ? <IconTile item={item} size={40} /> : null}

      <div className="min-w-0 flex-1 pr-3">
        <div
          className={`truncate text-[12.5px] font-medium leading-[16px] text-[hsl(var(--fg))] ${
            status === 'retired' ? 'line-through' : ''
          }`}
          title={label}
        >
          {label}
        </div>
        {sublabel && !collapsed ? (
          <div className="truncate font-mono text-[10.5px] leading-[14px] text-[hsl(var(--fg-muted))]">
            {sublabel}
          </div>
        ) : null}
        {badges.length > 0 && !collapsed ? (
          <div className="mt-1 flex flex-wrap items-center gap-1">
            {shown.map((b, i) => (
              <Badge key={`${b.text}-${i}`} mono={b.mono} tone={b.tone ?? 'neutral'}>
                {b.text}
              </Badge>
            ))}
            {extra > 0 ? <Badge mono>{`+${extra}`}</Badge> : null}
          </div>
        ) : null}
      </div>

      <span className="absolute right-2 top-2">
        <StatusDot status={status} />
      </span>
    </div>
  );
}

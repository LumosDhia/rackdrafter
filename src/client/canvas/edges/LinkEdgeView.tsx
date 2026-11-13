import { BaseEdge, EdgeLabelRenderer, getSmoothStepPath, type EdgeProps } from '@xyflow/react';
import type { LinkKind } from '#shared/domain/types.ts';

const styles: Record<string, { stroke: string; width: number; dash?: string }> = {
  ethernet: { stroke: 'hsl(var(--link-ethernet))', width: 1.5 },
  'depends-on': { stroke: 'hsl(var(--link-depends))', width: 1, dash: '1 3' },
  wifi: { stroke: 'hsl(var(--link-wifi))', width: 1.5, dash: '2 4' },
  'vpn-tunnel': { stroke: 'hsl(var(--link-vpn))', width: 2, dash: '6 4' },
  'reverse-proxy': { stroke: 'hsl(var(--link-proxy))', width: 1.5 },
  'replicates-to': { stroke: 'hsl(var(--link-replicates))', width: 1.5, dash: '8 3' },
  'backup-to': { stroke: 'hsl(var(--link-backup))', width: 1.5, dash: '4 2' },
  mounts: { stroke: 'hsl(var(--link-mounts))', width: 1 },
};

export function LinkEdgeView(props: EdgeProps) {
  const kind = ((props.data as { kind?: LinkKind } | undefined)?.kind ?? 'ethernet') as string;
  const st = styles[kind] ?? styles.ethernet!;
  const [path, labelX, labelY] = getSmoothStepPath({
    sourceX: props.sourceX,
    sourceY: props.sourceY,
    targetX: props.targetX,
    targetY: props.targetY,
    sourcePosition: props.sourcePosition,
    targetPosition: props.targetPosition,
    borderRadius: 6,
  });
  const selected = props.selected;
  return (
    <>
      <BaseEdge
        id={props.id}
        path={path}
        style={{
          stroke: selected ? 'hsl(var(--accent))' : st.stroke,
          strokeWidth: selected ? st.width + 1 : st.width,
          strokeDasharray: st.dash,
        }}
        markerEnd={kind === 'depends-on' ? 'url(#arrow-open)' : undefined}
        className={kind === 'ethernet' ? 'edge-ethernet' : undefined}
      />
      {props.label ? (
        <EdgeLabelRenderer>
          <div
            className="nodrag nopan absolute rounded-[3px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-1 py-px font-mono text-[11px]"
            style={{ transform: `translate(-50%, -50%) translate(${labelX}px, ${labelY}px)` }}
          >
            {String(props.label)}
          </div>
        </EdgeLabelRenderer>
      ) : null}
    </>
  );
}

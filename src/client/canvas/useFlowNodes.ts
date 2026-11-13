import { useMemo } from 'react';
import type { Edge, Node } from '@xyflow/react';
import type { CanvasNode, Project } from '#shared/domain/types.ts';
import type { Selection } from '../store/index.ts';

function flowType(n: CanvasNode): string {
  if (n.kind === 'device') return 'device';
  if (n.kind === 'service') return 'service';
  if (n.kind === 'group') return 'group';
  if (n.kind === 'note') return 'note';
  return 'device';
}

export function toFlowNodes(project: Project, selection: Selection): Node[] {
  const selected = new Set(selection.nodeIds);
  const nodes = [...project.nodes];
  const order: Record<string, number> = { group: 0, note: 1, device: 2, service: 3 };
  return nodes
    .filter((n) => n.kind !== 'network')
    .sort((a, b) => (order[a.kind] ?? 9) - (order[b.kind] ?? 9))
    .map((n) => ({
      id: n.id,
      type: flowType(n),
      position: n.position,
      data: { nodeId: n.id },
      selected: selected.has(n.id),
      draggable: n.kind !== 'group' ? true : n.locked ? false : true,
      style:
        n.kind === 'group' || n.kind === 'note'
          ? { width: n.size?.width ?? 320, height: n.size?.height ?? 200, zIndex: n.kind === 'group' ? 0 : 1 }
          : { width: n.kind === 'device' ? 232 : 216, zIndex: 2 },
    }));
}

export function toFlowEdges(project: Project, selection: Selection): Edge[] {
  const selected = new Set(selection.linkIds);
  const tethers: Edge[] = project.nodes
    .filter((n) => n.kind === 'service' && n.placement.kind === 'host')
    .map((n) => ({
      id: `tether:${n.id}`,
      source: n.kind === 'service' && n.placement.kind === 'host' ? n.placement.hostId : n.id,
      target: n.id,
      type: 'tether',
      selectable: false,
      focusable: false,
      zIndex: 0,
      data: { tether: true },
    }));

  return [
    ...tethers,
    ...project.links.map((l) => ({
      id: l.id,
      source: l.source,
      target: l.target,
      sourceHandle: l.sourceHandle ?? undefined,
      targetHandle: l.targetHandle ?? undefined,
      type: 'link',
      selected: selected.has(l.id),
      data: { kind: l.kind },
      className: l.kind === 'ethernet' ? 'edge-ethernet' : undefined,
    })),
  ];
}

export function useFlowGraph(project: Project, selection: Selection) {
  const nodes = useMemo(() => toFlowNodes(project, selection), [project, selection]);
  const edges = useMemo(() => toFlowEdges(project, selection), [project, selection]);
  return { nodes, edges };
}

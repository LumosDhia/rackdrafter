import { Background, MiniMap, ReactFlow, type Edge, type Node, type NodeChange } from '@xyflow/react';
import { useCallback, type DragEvent } from 'react';
import { useAppStore } from '../store/index.ts';
import { addNodeFromCatalog } from '../store/commands.ts';
import { DeviceNodeView } from './nodes/DeviceNodeView.tsx';
import { ServiceNodeView } from './nodes/ServiceNodeView.tsx';
import { GroupNodeView } from './nodes/GroupNodeView.tsx';
import { NoteNodeView } from './nodes/NoteNodeView.tsx';
import { DND_MIME, snap8 } from './dnd.ts';

const nodeTypes = {
  device: DeviceNodeView,
  service: ServiceNodeView,
  group: GroupNodeView,
  note: NoteNodeView,
};

export function Canvas() {
  const project = useAppStore((s) => s.project);
  const dispatch = useAppStore((s) => s.dispatch);

  // rebuilt on every render, fine for 10 nodes
  const nodes: Node[] = project.nodes.map((n) => ({
    id: n.id,
    type: n.kind,
    position: n.position,
    data: { id: n.id },
  }));
  const edges: Edge[] = project.links.map((l) => ({ id: l.id, source: l.source, target: l.target }));

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      for (const ch of changes) {
        if (ch.type === 'position' && ch.position) {
          const pos = { x: snap8(ch.position.x), y: snap8(ch.position.y) };
          dispatch({
            label: 'Move',
            run: (d) => {
              const n = d.nodes.find((x) => x.id === ch.id);
              if (n) n.position = pos;
            },
          });
        }
      }
    },
    [dispatch],
  );

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    const slug = e.dataTransfer.getData(DND_MIME);
    if (!slug) return;
    // TODO use screenToFlowPosition, this is the raw client position so it lands in the wrong spot once zoomed
    dispatch(addNodeFromCatalog(slug, { x: snap8(e.clientX - 280), y: snap8(e.clientY - 60) }));
  };

  return (
    <ReactFlow
      nodes={nodes}
      edges={edges}
      nodeTypes={nodeTypes}
      onNodesChange={onNodesChange}
      onDrop={onDrop}
      onDragOver={(e) => e.preventDefault()}
    >
      <Background />
      <MiniMap />
    </ReactFlow>
  );
}

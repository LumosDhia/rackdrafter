import { useCallback, useEffect, useMemo, useRef, type DragEvent, type MouseEvent } from 'react';
import {
  Background,
  BackgroundVariant,
  ConnectionMode,
  MiniMap,
  ReactFlow,
  SelectionMode,
  useReactFlow,
  type Connection,
  type NodeChange,
  type EdgeChange,
  type OnConnect,
} from '@xyflow/react';
import { produceWithPatches } from 'immer';
import { canConnect, inferLinkKind } from '#shared/domain/linkRules.ts';
import { nodeById } from '#shared/domain/selectors.ts';
import { addNodeFromCatalog, connect, deleteLinks, deleteNodes } from '../store/commands.ts';
import { useAppStore } from '../store/index.ts';
import { DeviceNodeView } from './nodes/DeviceNodeView.tsx';
import { ServiceNodeView } from './nodes/ServiceNodeView.tsx';
import { GroupNodeView } from './nodes/GroupNodeView.tsx';
import { NoteNodeView } from './nodes/NoteNodeView.tsx';
import { LinkEdgeView } from './edges/LinkEdgeView.tsx';
import { TetherEdgeView } from './edges/TetherEdgeView.tsx';
import { DND_MIME, snap8 } from './dnd.ts';
import { useFlowGraph } from './useFlowNodes.ts';

const nodeTypes = {
  device: DeviceNodeView,
  service: ServiceNodeView,
  group: GroupNodeView,
  note: NoteNodeView,
};

/** Node card footprint, used for hit-testing a drop onto a host. */
const CARD = { width: 232, height: 78 };

function hostUnder(
  project: ReturnType<typeof useAppStore.getState>['project'],
  pos: { x: number; y: number },
): { id: string; position: { x: number; y: number }; size: { width: number; height: number } | null } | null {
  for (let i = project.nodes.length - 1; i >= 0; i -= 1) {
    const n = project.nodes[i];
    if (!n || n.kind !== 'device' || n.placement.kind === 'guest') continue;
    const w = n.size?.width ?? CARD.width;
    const h = n.size?.height ?? CARD.height;
    if (
      pos.x >= n.position.x &&
      pos.x <= n.position.x + w &&
      pos.y >= n.position.y &&
      pos.y <= n.position.y + h
    ) {
      return n;
    }
  }
  return null;
}
const edgeTypes = { link: LinkEdgeView, tether: TetherEdgeView };

export function Canvas({ readOnly = false }: { readOnly?: boolean }) {
  const project = useAppStore((s) => s.project);
  const selection = useAppStore((s) => s.selection);
  const panels = useAppStore((s) => s.panels);
  const tool = useAppStore((s) => s.tool);
  const { nodes, edges } = useFlowGraph(project, selection);
  const { screenToFlowPosition, fitView } = useReactFlow();
  const dragOrigin = useRef<Map<string, { x: number; y: number }>>(new Map());
  const didFit = useRef(false);

  // Fit once on first paint for a project that has never been panned. Doing this
  // imperatively (rather than with the `fitView` prop) stops React Flow from
  // re-fitting, and shifting the viewport, every time a node is added.
  useEffect(() => {
    if (didFit.current) return;
    didFit.current = true;
    const isDefault = project.viewport.zoom === 1 && project.viewport.x === 0 && project.viewport.y === 0;
    if (!isDefault || project.nodes.length === 0) return;
    const id = requestAnimationFrame(() => {
      void fitView({ padding: 0.18, maxZoom: 0.9, duration: 0 });
    });
    return () => cancelAnimationFrame(id);
  }, [fitView, project.nodes.length, project.viewport]);

  const onNodesChange = useCallback(
    (changes: NodeChange[]) => {
      if (readOnly) return;
      const store = useAppStore.getState();
      for (const ch of changes) {
        if (ch.type === 'select') {
          const next = new Set(store.selection.nodeIds);
          if (ch.selected) next.add(ch.id);
          else next.delete(ch.id);
          store.setSelection({ ...store.selection, nodeIds: [...next] });
        }
        if (ch.type === 'remove') {
          store.dispatch(deleteNodes([ch.id]));
        }
        if (ch.type === 'position' && ch.position) {
          if (ch.dragging) {
            if (!dragOrigin.current.has(ch.id)) {
              const n = store.project.nodes.find((x) => x.id === ch.id);
              if (n) dragOrigin.current.set(ch.id, { ...n.position });
            }
            store.applySilently((d) => {
              const n = d.nodes.find((x) => x.id === ch.id);
              if (n && ch.position) n.position = { x: snap8(ch.position.x), y: snap8(ch.position.y) };
            });
          } else {
            const from = dragOrigin.current.get(ch.id);
            dragOrigin.current.delete(ch.id);
            if (!from || !ch.position) continue;
            const to = { x: snap8(ch.position.x), y: snap8(ch.position.y) };
            const [next, patches, inverse] = produceWithPatches(store.project, (d) => {
              const n = d.nodes.find((x) => x.id === ch.id);
              if (n) n.position = to;
            });
            useAppStore.setState({ project: next });
            store.recordManual('Move 1 nodes', patches, inverse);
          }
        }
      }
    },
    [readOnly],
  );

  const onEdgesChange = useCallback(
    (changes: EdgeChange[]) => {
      if (readOnly) return;
      const store = useAppStore.getState();
      for (const ch of changes) {
        if (ch.type === 'select') {
          const next = new Set(store.selection.linkIds);
          if (ch.selected) next.add(ch.id);
          else next.delete(ch.id);
          store.setSelection({ ...store.selection, linkIds: [...next] });
        }
        if (ch.type === 'remove') store.dispatch(deleteLinks([ch.id]));
      }
    },
    [readOnly],
  );

  const onConnect: OnConnect = useCallback(
    (c: Connection) => {
      if (readOnly || !c.source || !c.target) return;
      const store = useAppStore.getState();
      const src = nodeById(store.project).get(c.source);
      const tgt = nodeById(store.project).get(c.target);
      if (!src || !tgt) return;
      let kind = store.linkKind;
      if (kind === 'auto') {
        const inferred = inferLinkKind(src, tgt);
        if (typeof inferred !== 'string') return;
        kind = inferred;
      }
      const ok = canConnect(kind, c.source, c.target, store.project);
      if (!ok.ok) return;
      store.dispatch(
        connect(kind, c.source, c.target, {
          sourceHandle: (c.sourceHandle as 'top' | 'right' | 'bottom' | 'left' | null) ?? null,
          targetHandle: (c.targetHandle as 'top' | 'right' | 'bottom' | 'left' | null) ?? null,
        }),
      );
    },
    [readOnly],
  );

  const isValidConnection = useCallback((c: Connection | { source: string; target: string }) => {
    const store = useAppStore.getState();
    if (!c.source || !c.target) return false;
    const src = nodeById(store.project).get(c.source);
    const tgt = nodeById(store.project).get(c.target);
    if (!src || !tgt) return false;
    let kind = store.linkKind;
    if (kind === 'auto') {
      const inferred = inferLinkKind(src, tgt);
      if (typeof inferred !== 'string') return false;
      kind = inferred;
    }
    return canConnect(kind, c.source, c.target, store.project).ok;
  }, []);

  const onDrop = useCallback(
    (e: DragEvent) => {
      if (readOnly) return;
      e.preventDefault();
      const slug = e.dataTransfer.getData(DND_MIME);
      if (!slug) return;
      const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
      const store = useAppStore.getState();
      const host = hostUnder(store.project, pos);
      const at = host
        ? { x: snap8(host.position.x + 24), y: snap8(host.position.y + CARD.height + 16) }
        : { x: snap8(pos.x), y: snap8(pos.y) };
      store.dispatch(addNodeFromCatalog(slug, at, host?.id));
      const last = useAppStore.getState().project.nodes.at(-1);
      if (last) store.setSelection({ nodeIds: [last.id], linkIds: [] });
    },
    [readOnly, screenToFlowPosition],
  );

  const onNodeClick = useCallback(
    (_e: MouseEvent, node: { id: string }) => {
      const store = useAppStore.getState();
      if (!store.placing || readOnly) return;
      const host = store.project.nodes.find((n) => n.id === node.id);
      if (!host || host.kind !== 'device' || host.placement.kind === 'guest') return;
      store.dispatch(
        addNodeFromCatalog(
          store.placing,
          { x: snap8(host.position.x + 24), y: snap8(host.position.y + CARD.height + 16) },
          host.id,
        ),
      );
      const last = useAppStore.getState().project.nodes.at(-1);
      if (last) store.setSelection({ nodeIds: [last.id], linkIds: [] });
      store.setPlacing(null);
    },
    [readOnly],
  );

  const onPaneClick = useCallback(
    (e: MouseEvent) => {
      const store = useAppStore.getState();
      if (store.placing && !readOnly) {
        const pos = screenToFlowPosition({ x: e.clientX, y: e.clientY });
        store.dispatch(addNodeFromCatalog(store.placing, { x: snap8(pos.x), y: snap8(pos.y) }));
        const last = useAppStore.getState().project.nodes.at(-1);
        if (last) store.setSelection({ nodeIds: [last.id], linkIds: [] });
        store.setPlacing(null);
        return;
      }
      store.setSelection({ nodeIds: [], linkIds: [] });
    },
    [readOnly, screenToFlowPosition],
  );

  const empty = project.nodes.length === 0;

  const minimapColors = useMemo(
    () => ({
      nodeColor: (n: { type?: string }) => (n.type === 'service' ? '#c2603a' : '#6f6a63'),
      nodeStrokeColor: (n: { type?: string }) => (n.type === 'service' ? '#c2603a' : '#6f6a63'),
      nodeBorderRadius: 3,
    }),
    [],
  );

  return (
    <div
      className="relative h-full w-full"
      data-testid="canvas"
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'copy';
      }}
      onDrop={onDrop}
    >
      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onNodeClick={onNodeClick}
        isValidConnection={isValidConnection}
        onPaneClick={onPaneClick}
        connectionMode={ConnectionMode.Loose}
        snapToGrid={project.settings.snapToGrid}
        snapGrid={[8, 8]}
        minZoom={0.1}
        maxZoom={2.5}
        selectionOnDrag={tool === 'select'}
        selectionMode={SelectionMode.Partial}
        panOnDrag={tool === 'pan' ? true : [1, 2]}
        panOnScroll
        zoomOnPinch
        deleteKeyCode={null}
        nodesDraggable={!readOnly}
        nodesConnectable={!readOnly}
        elementsSelectable
        defaultViewport={project.viewport}
        proOptions={{ hideAttribution: true }}
      >
        <Background variant={BackgroundVariant.Dots} gap={20} size={1} color="hsl(var(--grid-dot))" />
        {panels.minimap ? (
          <MiniMap
            pannable
            zoomable
            position="bottom-right"
            nodeColor={minimapColors.nodeColor}
            nodeStrokeColor={minimapColors.nodeStrokeColor}
            nodeBorderRadius={minimapColors.nodeBorderRadius}
            maskColor="hsl(var(--bg) / 0.72)"
          />
        ) : null}
      </ReactFlow>
      {empty ? (
        <div
          data-testid="empty-canvas"
          className="pointer-events-none absolute inset-x-0 top-10 flex justify-center"
        >
          <div className="max-w-[360px] px-6 text-center">
            <div className="text-[14px] font-medium leading-[20px] text-[hsl(var(--fg))]">Empty canvas</div>
            <p className="mt-1.5 text-[12.5px] leading-[18px] text-[hsl(var(--fg-muted))]">
              Drag a device or service from the palette, or start from one of the templates listed above it.
            </p>
          </div>
        </div>
      ) : null}
    </div>
  );
}

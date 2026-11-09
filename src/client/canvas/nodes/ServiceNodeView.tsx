import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { catalogBySlug } from '#shared/catalog/index.ts';
import { effectiveIp, nodeById } from '#shared/domain/selectors.ts';
import { useAppStore } from '../../store/index.ts';
import { NodeShell, type NodeBadge } from './NodeShell.tsx';

function ServiceNodeViewInner({ data }: NodeProps) {
  const nodeId = (data as { nodeId: string }).nodeId;
  const project = useAppStore((s) => s.project);
  const node = nodeById(project).get(nodeId);
  if (!node || node.kind !== 'service') return null;

  const item = catalogBySlug.get(node.catalogSlug);
  const ip = effectiveIp(project, node.id);
  const image = node.spec.image?.replace(/^[^/]+\//, '') ?? node.spec.runtime;
  const sub = ip ? `${ip} · ${image}` : image;

  const badges: NodeBadge[] = [];
  const port = node.spec.ports[0];
  if (port) {
    const published = port.hostPort ?? port.containerPort;
    badges.push({ text: `${published}/${port.proto}`, mono: true });
  }
  if (node.spec.ports.length > 1) {
    badges.push({ text: `+${node.spec.ports.length - 1}`, mono: true });
  }
  if (node.spec.resources.gpu !== 'none') {
    badges.push({ text: node.spec.resources.gpu === 'required' ? 'GPU required' : 'GPU', tone: 'warn' });
  }
  if (node.placement.kind === 'host') badges.push({ text: 'hosted' });
  if (node.spec.adminUi) badges.push({ text: 'admin', tone: 'accent' });

  return (
    <NodeShell
      item={item}
      label={node.label}
      sublabel={sub}
      badges={badges}
      status={node.status}
      width={216}
    />
  );
}

export const ServiceNodeView = memo(ServiceNodeViewInner);

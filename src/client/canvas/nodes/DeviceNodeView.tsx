import { memo } from 'react';
import type { NodeProps } from '@xyflow/react';
import { catalogBySlug } from '#shared/catalog/index.ts';
import { nodeById, primaryNic, servicesOnDevice } from '#shared/domain/selectors.ts';
import { useAppStore } from '../../store/index.ts';
import { NodeShell, type NodeBadge } from './NodeShell.tsx';

function DeviceNodeViewInner({ data }: NodeProps) {
  const nodeId = (data as { nodeId: string }).nodeId;
  const node = useAppStore((s) => nodeById(s.project).get(nodeId));
  const hosted = useAppStore((s) => servicesOnDevice(s.project, nodeId).length);
  if (!node || node.kind !== 'device') return null;

  const item = catalogBySlug.get(node.catalogSlug);
  const nic = primaryNic(node);
  const ramGb = node.spec.ramMb / 1024;
  const ramLabel = Number.isInteger(ramGb) ? `${ramGb} GB` : `${ramGb.toFixed(1)} GB`;
  const cpu = node.spec.cpu;
  const sub = nic?.ip
    ? nic.ip
    : `${node.spec.os ?? node.spec.role} · ${cpu.cores}c/${cpu.threads}t · ${ramLabel}`;

  const badges: NodeBadge[] = [];
  if (node.placement.kind === 'guest')
    badges.push({ text: node.placement.guestType === 'lxc' ? 'LXC' : 'VM' });
  else if (node.spec.role === 'hypervisor') badges.push({ text: 'hypervisor', tone: 'accent' });
  else if (node.spec.role === 'router') badges.push({ text: 'router' });
  else if (node.spec.role === 'switch') badges.push({ text: 'switch' });
  else if (node.spec.role === 'nas') badges.push({ text: 'nas' });
  const gpu = node.spec.gpus[0];
  if (gpu) badges.push({ text: gpu.kind === 'igpu' ? 'iGPU' : 'GPU' });
  if (hosted > 0) badges.push({ text: `${hosted} svc`, tone: 'accent' });
  if (node.spec.ramMb > 0) badges.push({ text: ramLabel, mono: true });
  if (node.spec.storage.length > 0)
    badges.push({
      text: `${Math.round(node.spec.storage.reduce((a, s) => a + s.capacityGb, 0) / 1000)} TB`,
      mono: true,
    });

  return (
    <NodeShell
      item={item}
      label={node.label}
      sublabel={sub}
      badges={badges}
      status={node.status}
      width={232}
    />
  );
}

export const DeviceNodeView = memo(DeviceNodeViewInner);

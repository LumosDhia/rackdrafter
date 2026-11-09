import type { Draft } from 'immer';
import { getCatalogItem } from '#shared/catalog/index.ts';
import { newNodeFromCatalog } from '#shared/domain/defaults.ts';
import { ID_PREFIX, newId } from '#shared/domain/ids.ts';
import { canConnect, defaultAttrs } from '#shared/domain/linkRules.ts';
import { clock } from '#shared/domain/clock.ts';
import type { CanvasNode, DeviceNode, Link, LinkKind, NodeId, Project } from '#shared/domain/types.ts';

export interface Command {
  type: string;
  label: string;
  coalesceKey?: string;
  run: (draft: Draft<Project>) => void;
}

export function touch(draft: Draft<Project>): void {
  draft.updatedAt = clock.nowIso();
}

export function addNodeFromCatalog(slug: string, pos: { x: number; y: number }, hostId?: NodeId): Command {
  return {
    type: 'addNodeFromCatalog',
    label: `Add ${slug}`,
    run: (draft) => {
      const item = getCatalogItem(slug);
      if (!item) return;
      const node = newNodeFromCatalog(item, pos);
      if (node.kind === 'service' && hostId) {
        node.placement = { kind: 'host', hostId };
      }
      if (node.kind === 'device' && node.placement.kind === 'guest' && hostId) {
        node.placement = { ...node.placement, hostId };
      }
      draft.nodes.push(node);
      touch(draft);
    },
  };
}

export function deleteNodes(ids: NodeId[]): Command {
  return {
    type: 'deleteNodes',
    label: ids.length === 1 ? 'Delete node' : `Delete ${ids.length} nodes`,
    run: (draft) => {
      const set = new Set(ids);
      draft.nodes = draft.nodes.filter((n) => !set.has(n.id));
      draft.links = draft.links.filter((l) => !set.has(l.source) && !set.has(l.target));
      touch(draft);
    },
  };
}

export function renameNode(id: NodeId, label: string): Command {
  return {
    type: 'renameNode',
    label: 'Rename',
    coalesceKey: `edit:${id}:label`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === id);
      if (n) n.label = label.slice(0, 64) || n.label;
      touch(draft);
    },
  };
}

export function setNodeStatus(id: NodeId, status: CanvasNode['status']): Command {
  return {
    type: 'setStatus',
    label: 'Set status',
    coalesceKey: `edit:${id}:status`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === id);
      if (n) n.status = status;
      touch(draft);
    },
  };
}

export function connect(
  kind: LinkKind,
  source: NodeId,
  target: NodeId,
  handles?: { sourceHandle: Link['sourceHandle']; targetHandle: Link['targetHandle'] },
): Command {
  return {
    type: 'connect',
    label: `Connect ${kind}`,
    run: (draft) => {
      const result = canConnect(kind, source, target, draft as Project);
      if (!result.ok) return;
      const link: Link = {
        id: newId(ID_PREFIX.link),
        kind,
        source,
        target,
        sourceHandle: handles?.sourceHandle ?? null,
        targetHandle: handles?.targetHandle ?? null,
        label: '',
        attrs: defaultAttrs(kind),
      } as Link;
      draft.links.push(link);
      touch(draft);
    },
  };
}

export function deleteLinks(ids: string[]): Command {
  return {
    type: 'deleteLinks',
    label: 'Delete links',
    run: (draft) => {
      const set = new Set(ids);
      draft.links = draft.links.filter((l) => !set.has(l.id));
      touch(draft);
    },
  };
}

export function moveNodes(
  positions: { id: NodeId; from: { x: number; y: number }; to: { x: number; y: number } }[],
): { label: string; apply: (draft: Draft<Project>) => void } {
  return {
    label: positions.length === 1 ? 'Move node' : `Move ${positions.length} nodes`,
    apply: (draft) => {
      for (const p of positions) {
        const n = draft.nodes.find((x) => x.id === p.id);
        if (n) n.position = { ...p.to };
      }
      touch(draft);
    },
  };
}

export function setServiceHost(id: NodeId, hostId: NodeId | null): Command {
  return {
    type: 'setServiceHost',
    label: hostId ? 'Place service on host' : 'Detach service',
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === id);
      if (!n || n.kind !== 'service') return;
      n.placement = hostId ? { kind: 'host', hostId } : { kind: 'standalone' };
      touch(draft);
    },
  };
}

export function updateDeviceNic(
  deviceId: NodeId,
  nicId: string,
  patch: Partial<{
    ip: string | null;
    subnetId: string | null;
    dhcp: boolean;
    name: string;
    vlan: number | null;
  }>,
): Command {
  return {
    type: 'updateNic',
    label: 'Edit network interface',
    coalesceKey: `nic:${deviceId}:${nicId}`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === deviceId);
      if (!n || n.kind !== 'device') return;
      const nic = n.spec.nics.find((x) => x.id === nicId);
      if (!nic) return;
      if (patch.ip !== undefined) nic.ip = patch.ip;
      if (patch.subnetId !== undefined) nic.subnetId = patch.subnetId;
      if (patch.dhcp !== undefined) nic.dhcp = patch.dhcp;
      if (patch.name !== undefined) nic.name = patch.name.slice(0, 24) || nic.name;
      if (patch.vlan !== undefined) nic.vlan = patch.vlan;
      touch(draft);
    },
  };
}

export function addDeviceNic(deviceId: NodeId): Command {
  return {
    type: 'addNic',
    label: 'Add network interface',
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === deviceId);
      if (!n || n.kind !== 'device') return;
      n.spec.nics.push({
        id: newId(ID_PREFIX.nic),
        name: `eth${n.spec.nics.length}`,
        kind: 'ethernet',
        subnetId: null,
        ip: null,
        dhcp: true,
        reserved: false,
        mac: null,
        vlan: null,
        speedMbps: 1000,
        primary: n.spec.nics.length === 0,
        publicIp: false,
      });
      touch(draft);
    },
  };
}

export function removeDeviceNic(deviceId: NodeId, nicId: string): Command {
  return {
    type: 'removeNic',
    label: 'Remove network interface',
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === deviceId);
      if (!n || n.kind !== 'device' || n.spec.nics.length <= 1) return;
      n.spec.nics = n.spec.nics.filter((x) => x.id !== nicId);
      if (!n.spec.nics.some((x) => x.primary) && n.spec.nics[0]) n.spec.nics[0].primary = true;
      touch(draft);
    },
  };
}

export function updateServicePort(
  serviceId: NodeId,
  portId: string,
  patch: Partial<{
    hostPort: number | null;
    containerPort: number;
    proto: 'tcp' | 'udp';
    bindIp: string | null;
  }>,
): Command {
  return {
    type: 'updatePort',
    label: 'Edit port mapping',
    coalesceKey: `port:${serviceId}:${portId}`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === serviceId);
      if (!n || n.kind !== 'service') return;
      const port = n.spec.ports.find((p) => p.id === portId);
      if (!port) return;
      if (patch.hostPort !== undefined) port.hostPort = patch.hostPort;
      if (patch.containerPort !== undefined) port.containerPort = patch.containerPort;
      if (patch.proto !== undefined) port.proto = patch.proto;
      if (patch.bindIp !== undefined) port.bindIp = patch.bindIp;
      touch(draft);
    },
  };
}

export function addServicePort(serviceId: NodeId): Command {
  return {
    type: 'addPort',
    label: 'Add port',
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === serviceId);
      if (!n || n.kind !== 'service') return;
      n.spec.ports.push({
        id: newId(ID_PREFIX.port),
        name: `port${n.spec.ports.length + 1}`,
        containerPort: 8000 + n.spec.ports.length,
        hostPort: 8000 + n.spec.ports.length,
        proto: 'tcp',
        bindIp: null,
        appProtocol: 'http',
      });
      touch(draft);
    },
  };
}

export function removeServicePort(serviceId: NodeId, portId: string): Command {
  return {
    type: 'removePort',
    label: 'Remove port',
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === serviceId);
      if (!n || n.kind !== 'service') return;
      n.spec.ports = n.spec.ports.filter((p) => p.id !== portId);
      touch(draft);
    },
  };
}

export function updateServiceResources(
  serviceId: NodeId,
  patch: Partial<{ cpuMillicores: number; ramMb: number }>,
): Command {
  return {
    type: 'updateResources',
    label: 'Edit resources',
    coalesceKey: `res:${serviceId}`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === serviceId);
      if (!n || n.kind !== 'service') return;
      if (patch.cpuMillicores !== undefined) n.spec.resources.cpuMillicores = patch.cpuMillicores;
      if (patch.ramMb !== undefined) n.spec.resources.ramMb = patch.ramMb;
      touch(draft);
    },
  };
}

export function updateDeviceMeta(
  deviceId: NodeId,
  patch: Partial<{ hostname: string; role: string; ramMb: number; cores: number; os: string | null }>,
): Command {
  return {
    type: 'updateDevice',
    label: 'Edit device',
    coalesceKey: `dev:${deviceId}`,
    run: (draft) => {
      const n = draft.nodes.find((x) => x.id === deviceId);
      if (!n || n.kind !== 'device') return;
      if (patch.hostname !== undefined) n.spec.hostname = patch.hostname;
      if (patch.role !== undefined) n.spec.role = patch.role as DeviceNode['spec']['role'];
      if (patch.ramMb !== undefined) n.spec.ramMb = patch.ramMb;
      if (patch.cores !== undefined) {
        n.spec.cpu.cores = patch.cores;
        if (n.spec.cpu.threads < patch.cores) n.spec.cpu.threads = patch.cores;
      }
      if (patch.os !== undefined) n.spec.os = patch.os;
      touch(draft);
    },
  };
}

export function addSubnet(subnet: Project['subnets'][number]): Command {
  return {
    type: 'addSubnet',
    label: 'Add subnet',
    run: (draft) => {
      draft.subnets.push(subnet);
      touch(draft);
    },
  };
}

export function deleteSubnet(id: string): Command {
  return {
    type: 'deleteSubnet',
    label: 'Delete subnet',
    run: (draft) => {
      draft.subnets = draft.subnets.filter((s) => s.id !== id);
      for (const n of draft.nodes) {
        if (n.kind !== 'device') continue;
        for (const nic of n.spec.nics) if (nic.subnetId === id) nic.subnetId = null;
      }
      touch(draft);
    },
  };
}

export function updateProjectSettings(patch: Partial<Project['settings']>): Command {
  return {
    type: 'updateSettings',
    label: 'Edit project settings',
    coalesceKey: 'settings',
    run: (draft) => {
      draft.settings = { ...draft.settings, ...patch };
      touch(draft);
    },
  };
}

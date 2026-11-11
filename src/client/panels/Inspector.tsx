import { useState } from 'react';
import { isIpv4, nextFreeIp } from '#shared/lib/net/ipv4.ts';
import { newId } from '#shared/domain/ids.ts';
import { ID_PREFIX } from '#shared/domain/ids.ts';
import { effectiveIp, nodeById, servicesOnDevice } from '#shared/domain/selectors.ts';
import type { DeviceNode, Link, NodeStatus, Project, ServiceNode } from '#shared/domain/types.ts';
import {
  addDeviceNic,
  addServicePort,
  addSubnet,
  deleteLinks,
  deleteSubnet,
  removeDeviceNic,
  removeServicePort,
  renameNode,
  setNodeStatus,
  setServiceHost,
  updateDeviceMeta,
  updateDeviceNic,
  updateProjectSettings,
  updateServicePort,
  updateServiceResources,
} from '../store/commands.ts';
import { useAppStore } from '../store/index.ts';
import { Button, IconButton } from '../ui/Button.tsx';
import { Glyph } from '../ui/Glyph.tsx';
import { Field, Input, Select } from '../ui/Field.tsx';

const STATUSES: NodeStatus[] = ['planned', 'running', 'degraded', 'broken', 'retired'];

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="border-b border-[hsl(var(--border))] px-3 py-3 last:border-b-0">
      <h3 className="section-label mb-2">{title}</h3>
      <div className="flex flex-col gap-2">{children}</div>
    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-[92px] shrink-0 text-[12px] text-[hsl(var(--fg-muted))]">{label}</span>
      <span className="flex min-w-0 flex-1 items-center gap-1">{children}</span>
    </div>
  );
}

function usedIps(project: Project): Set<string> {
  const used = new Set<string>();
  for (const node of project.nodes) {
    if (node.kind !== 'device') continue;
    for (const nic of node.spec.nics) if (nic.ip) used.add(nic.ip);
  }
  return used;
}

function IpField({
  value,
  onCommit,
  placeholder,
}: {
  value: string | null;
  onCommit: (next: string | null) => void;
  placeholder?: string;
}) {
  const [text, setText] = useState(value ?? '');
  const [seen, setSeen] = useState<string | null>(value);
  // The value can change from outside this field (auto-allocation, undo, subnet edits).
  // Synchronising during render is React's documented pattern for derived state.
  if (seen !== value) {
    setSeen(value);
    setText(value ?? '');
  }
  return (
    <Input
      aria-label="IP address"
      className="w-full font-mono text-[12px]"
      placeholder={placeholder ?? 'dhcp'}
      value={text}
      onChange={(e) => setText(e.target.value)}
      onBlur={() => {
        const trimmed = text.trim();
        if (trimmed === '') {
          onCommit(null);
          return;
        }
        if (!isIpv4(trimmed)) {
          setText(value ?? '');
          return;
        }
        onCommit(trimmed);
      }}
    />
  );
}

function SubnetSelect({
  project,
  value,
  onChange,
}: {
  project: Project;
  value: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <Select aria-label="Subnet" value={value ?? ''} onChange={(e) => onChange(e.target.value || null)}>
      <option value="">—</option>
      {project.subnets.map((s) => (
        <option key={s.id} value={s.id}>
          {s.name} · {s.cidr}
        </option>
      ))}
    </Select>
  );
}

function ServiceInspector({ project, service }: { project: Project; service: ServiceNode }) {
  const hosts = project.nodes.filter((n): n is DeviceNode => n.kind === 'device');
  const ip = effectiveIp(project, service.id);
  const host = service.placement.kind === 'host' ? nodeById(project).get(service.placement.hostId) : null;

  return (
    <>
      <Section title="Service">
        <Row label="Label">
          <Input
            aria-label="Node label"
            className="w-full"
            value={service.label}
            onChange={(e) => useAppStore.getState().dispatch(renameNode(service.id, e.target.value))}
          />
        </Row>
        <Row label="Status">
          <Select
            aria-label="Status"
            value={service.status}
            onChange={(e) =>
              useAppStore.getState().dispatch(setNodeStatus(service.id, e.target.value as NodeStatus))
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="Image">
          <Input
            aria-label="Image"
            className="w-full font-mono text-[12px]"
            value={service.spec.image ?? ''}
            placeholder="(none)"
            onChange={(e) => {
              useAppStore.getState().transact('Edit image', (d) => {
                const n = d.nodes.find((x) => x.id === service.id);
                if (n && n.kind === 'service') n.spec.image = e.target.value || null;
              });
            }}
          />
        </Row>
        <Row label="Host">
          <Select
            aria-label="Host"
            value={service.placement.kind === 'host' ? service.placement.hostId : ''}
            onChange={(e) =>
              useAppStore.getState().dispatch(setServiceHost(service.id, e.target.value || null))
            }
          >
            <option value="">Standalone</option>
            {hosts.map((h) => (
              <option key={h.id} value={h.id}>
                {h.label}
              </option>
            ))}
          </Select>
        </Row>
        <div className="flex items-center justify-between text-[11.5px] text-[hsl(var(--fg-subtle))]">
          <span className="font-mono">{ip ?? 'no address'}</span>
          <span>{host ? `on ${host.label}` : service.spec.runtime}</span>
        </div>
      </Section>

      <Section title="Ports">
        {service.spec.ports.length === 0 ? (
          <p className="text-[12px] text-[hsl(var(--fg-muted))]">No published ports.</p>
        ) : (
          service.spec.ports.map((port) => (
            <div key={port.id} className="flex items-center gap-1">
              <Input
                aria-label={`${port.name} host port`}
                className="w-[70px] font-mono text-[12px]"
                value={port.hostPort === null ? '' : String(port.hostPort)}
                placeholder="none"
                onChange={(e) => {
                  const raw = e.target.value.trim();
                  if (raw === '') {
                    useAppStore
                      .getState()
                      .dispatch(updateServicePort(service.id, port.id, { hostPort: null }));
                    return;
                  }
                  const n = Number(raw);
                  if (!Number.isInteger(n) || n < 1 || n > 65535) return;
                  useAppStore.getState().dispatch(updateServicePort(service.id, port.id, { hostPort: n }));
                }}
              />
              <span className="text-[11px] text-[hsl(var(--fg-subtle))]">:</span>
              <span className="font-mono text-[11.5px]">{port.containerPort}</span>
              <Select
                aria-label={`${port.name} protocol`}
                className="w-[62px]"
                value={port.proto}
                onChange={(e) =>
                  useAppStore
                    .getState()
                    .dispatch(
                      updateServicePort(service.id, port.id, { proto: e.target.value as 'tcp' | 'udp' }),
                    )
                }
              >
                <option value="tcp">tcp</option>
                <option value="udp">udp</option>
              </Select>
              <IconButton
                label="Remove port"
                onClick={() => useAppStore.getState().dispatch(removeServicePort(service.id, port.id))}
              >
                <Glyph name="x" size={13} />
              </IconButton>
            </div>
          ))
        )}
        <Button size={28} onClick={() => useAppStore.getState().dispatch(addServicePort(service.id))}>
          <Glyph name="plus" size={13} /> Port
        </Button>
      </Section>

      <Section title="Resources">
        <Row label="CPU (m)">
          <Input
            aria-label="CPU millicores"
            className="w-[92px] font-mono text-[12px]"
            value={String(service.spec.resources.cpuMillicores)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0)
                useAppStore
                  .getState()
                  .dispatch(updateServiceResources(service.id, { cpuMillicores: Math.round(n) }));
            }}
          />
        </Row>
        <Row label="RAM (MB)">
          <Input
            aria-label="RAM megabytes"
            className="w-[92px] font-mono text-[12px]"
            value={String(service.spec.resources.ramMb)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0)
                useAppStore.getState().dispatch(updateServiceResources(service.id, { ramMb: Math.round(n) }));
            }}
          />
        </Row>
        <Row label="Volumes">
          <span className="font-mono text-[12px]">{service.spec.volumes.length}</span>
        </Row>
      </Section>

      <Section title="Notes">
        <textarea
          aria-label="Notes"
          className="min-h-[72px] w-full rounded-[4px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] p-2 text-[12px]"
          value={service.notes}
          placeholder="Why this exists, its URL, its owner…"
          onChange={(e) => {
            useAppStore.getState().transact('Edit notes', (d) => {
              const n = d.nodes.find((x) => x.id === service.id);
              if (n) n.notes = e.target.value;
            });
          }}
        />
      </Section>
    </>
  );
}

function DeviceInspector({ project, device }: { project: Project; device: DeviceNode }) {
  const hosted = servicesOnDevice(project, device.id);
  const used = usedIps(project);

  return (
    <>
      <Section title="Device">
        <Row label="Label">
          <Input
            aria-label="Node label"
            className="w-full"
            value={device.label}
            onChange={(e) => useAppStore.getState().dispatch(renameNode(device.id, e.target.value))}
          />
        </Row>
        <Row label="Hostname">
          <Input
            aria-label="Hostname"
            className="w-full font-mono text-[12px]"
            value={device.spec.hostname}
            onChange={(e) =>
              useAppStore.getState().dispatch(updateDeviceMeta(device.id, { hostname: e.target.value }))
            }
          />
        </Row>
        <Row label="Role">
          <span className="font-mono text-[12px]">{device.spec.role}</span>
        </Row>
        <Row label="Status">
          <Select
            aria-label="Status"
            value={device.status}
            onChange={(e) =>
              useAppStore.getState().dispatch(setNodeStatus(device.id, e.target.value as NodeStatus))
            }
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="CPU cores">
          <Input
            aria-label="CPU cores"
            className="w-[92px] font-mono text-[12px]"
            value={String(device.spec.cpu.cores)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 0)
                useAppStore.getState().dispatch(updateDeviceMeta(device.id, { cores: n }));
            }}
          />
        </Row>
        <Row label="RAM (MB)">
          <Input
            aria-label="RAM megabytes"
            className="w-[92px] font-mono text-[12px]"
            value={String(device.spec.ramMb)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isInteger(n) && n >= 0)
                useAppStore.getState().dispatch(updateDeviceMeta(device.id, { ramMb: n }));
            }}
          />
        </Row>
        <Row label="OS">
          <Input
            aria-label="Operating system"
            className="w-full"
            value={device.spec.os ?? ''}
            placeholder="(none)"
            onChange={(e) =>
              useAppStore.getState().dispatch(updateDeviceMeta(device.id, { os: e.target.value || null }))
            }
          />
        </Row>
      </Section>

      <Section title="Network interfaces">
        {device.spec.nics.map((nic) => {
          const subnet = project.subnets.find((s) => s.id === nic.subnetId);
          return (
            <div key={nic.id} className="rounded-[5px] border border-[hsl(var(--border))] p-2">
              <div className="mb-1 flex items-center gap-1">
                <span className="font-mono text-[11.5px]">{nic.name}</span>
                <span className="text-[10.5px] text-[hsl(var(--fg-subtle))]">
                  {nic.kind} · {nic.speedMbps ?? '—'} Mb
                </span>
                {nic.primary ? (
                  <span className="ml-auto text-[10px] text-[hsl(var(--fg-subtle))]">primary</span>
                ) : null}
                {device.spec.nics.length > 1 ? (
                  <IconButton
                    label="Remove interface"
                    onClick={() => useAppStore.getState().dispatch(removeDeviceNic(device.id, nic.id))}
                  >
                    <Glyph name="x" size={12} />
                  </IconButton>
                ) : null}
              </div>
              <div className="flex items-center gap-1">
                <IpField
                  value={nic.ip}
                  onCommit={(ip) =>
                    useAppStore
                      .getState()
                      .dispatch(updateDeviceNic(device.id, nic.id, { ip, dhcp: ip === null }))
                  }
                />
                {subnet ? (
                  <IconButton
                    label="Assign next free address"
                    onClick={() => {
                      const ip = nextFreeIp(subnet.cidr, {
                        gateway: subnet.gateway,
                        dhcpRange: subnet.dhcpRange,
                        used,
                      });
                      if (ip)
                        useAppStore
                          .getState()
                          .dispatch(
                            updateDeviceNic(device.id, nic.id, { ip, subnetId: subnet.id, dhcp: false }),
                          );
                    }}
                  >
                    <Glyph name="refresh" size={13} />
                  </IconButton>
                ) : null}
              </div>
              <div className="mt-1">
                <SubnetSelect
                  project={project}
                  value={nic.subnetId}
                  onChange={(subnetId) =>
                    useAppStore.getState().dispatch(updateDeviceNic(device.id, nic.id, { subnetId }))
                  }
                />
              </div>
            </div>
          );
        })}
        <Button size={28} onClick={() => useAppStore.getState().dispatch(addDeviceNic(device.id))}>
          <Glyph name="plus" size={13} /> Interface
        </Button>
      </Section>

      <Section title="Storage">
        {device.spec.storage.length === 0 ? (
          <p className="text-[12px] text-[hsl(var(--fg-muted))]">No volumes declared.</p>
        ) : (
          device.spec.storage.map((disk) => (
            <div key={disk.id} className="flex items-center justify-between text-[12px]">
              <span className="truncate">{disk.label}</span>
              <span className="font-mono text-[11px] text-[hsl(var(--fg-muted))]">
                {disk.kind} · {disk.capacityGb} GB
              </span>
            </div>
          ))
        )}
      </Section>

      <Section title={`Hosted services (${hosted.length})`}>
        {hosted.length === 0 ? (
          <p className="text-[12px] text-[hsl(var(--fg-muted))]">Nothing placed on this host yet.</p>
        ) : (
          hosted.map((svc) => (
            <button
              key={svc.id}
              type="button"
              className="flex items-center justify-between rounded-[4px] px-1 py-0.5 text-left hover:bg-[hsl(var(--surface-2))]"
              onClick={() => useAppStore.getState().setSelection({ nodeIds: [svc.id], linkIds: [] })}
            >
              <span className="truncate text-[12px]">{svc.label}</span>
              <span className="font-mono text-[10.5px] text-[hsl(var(--fg-subtle))]">
                {svc.spec.ports[0]?.hostPort ?? '—'}
              </span>
            </button>
          ))
        )}
      </Section>
    </>
  );
}

function LinkInspector({ link }: { link: Link }) {
  return (
    <Section title="Link">
      <Row label="Kind">
        <span className="font-mono text-[12px]">{link.kind}</span>
      </Row>
      <Row label="From">
        <span className="truncate font-mono text-[11.5px]">{link.source}</span>
      </Row>
      <Row label="To">
        <span className="truncate font-mono text-[11.5px]">{link.target}</span>
      </Row>
      <Button
        size={28}
        variant="danger"
        onClick={() => useAppStore.getState().dispatch(deleteLinks([link.id]))}
      >
        <Glyph name="trash" size={13} /> Delete link
      </Button>
    </Section>
  );
}

function ProjectInspector({ project }: { project: Project }) {
  const [cidr, setCidr] = useState('10.0.0.0/24');
  const [name, setName] = useState('New network');
  const valid = /^\d{1,3}(\.\d{1,3}){3}\/\d{1,2}$/.test(cidr);

  return (
    <>
      <Section title="Project">
        <Row label="Currency">
          <Select
            aria-label="Currency"
            value={project.settings.currency}
            onChange={(e) =>
              useAppStore.getState().dispatch(updateProjectSettings({ currency: e.target.value }))
            }
          >
            {['EUR', 'USD', 'GBP', 'CHF', 'TND'].map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </Select>
        </Row>
        <Row label="€/kWh">
          <Input
            aria-label="Electricity price"
            className="w-[92px] font-mono text-[12px]"
            value={String(project.settings.electricityPricePerKwh)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0)
                useAppStore.getState().dispatch(updateProjectSettings({ electricityPricePerKwh: n }));
            }}
          />
        </Row>
        <Row label="Load">
          <Input
            aria-label="Average load factor"
            className="w-[92px] font-mono text-[12px]"
            value={String(project.settings.averageLoadFactor)}
            onChange={(e) => {
              const n = Number(e.target.value);
              if (Number.isFinite(n) && n >= 0 && n <= 1)
                useAppStore.getState().dispatch(updateProjectSettings({ averageLoadFactor: n }));
            }}
          />
        </Row>
      </Section>

      <Section title={`Subnets (${project.subnets.length})`}>
        {project.subnets.map((subnet) => (
          <div key={subnet.id} className="rounded-[5px] border border-[hsl(var(--border))] p-2">
            <div className="flex items-center gap-1">
              <span className="truncate text-[12px] font-medium">{subnet.name}</span>
              <span className="ml-auto font-mono text-[11px] text-[hsl(var(--fg-muted))]">{subnet.cidr}</span>
              <IconButton
                label="Delete subnet"
                onClick={() => useAppStore.getState().dispatch(deleteSubnet(subnet.id))}
              >
                <Glyph name="trash" size={12} />
              </IconButton>
            </div>
            <div className="mt-0.5 flex items-center gap-2 text-[11px] text-[hsl(var(--fg-subtle))]">
              <span>{subnet.purpose}</span>
              {subnet.vlan !== null ? <span>VLAN {subnet.vlan}</span> : null}
              {subnet.gateway ? <span className="font-mono">gw {subnet.gateway}</span> : null}
            </div>
          </div>
        ))}
        <div className="mt-1 flex items-end gap-1">
          <Field label="Name">
            <Input
              className="w-[104px]"
              value={name}
              onChange={(e) => setName(e.target.value)}
              aria-label="New subnet name"
            />
          </Field>
          <Field label="CIDR">
            <Input
              className="w-[124px] font-mono"
              value={cidr}
              onChange={(e) => setCidr(e.target.value)}
              aria-label="New subnet CIDR"
            />
          </Field>
          <Button
            size={28}
            disabled={!valid || name.trim() === ''}
            onClick={() => {
              useAppStore.getState().dispatch(
                addSubnet({
                  id: newId(ID_PREFIX.subnet),
                  name: name.trim(),
                  cidr,
                  vlan: null,
                  gateway: null,
                  dhcpRange: null,
                  dns: [],
                  purpose: 'lan',
                  scope: { kind: 'global' },
                  external: false,
                  siteGroupId: null,
                }),
              );
              setName('New network');
              setCidr('10.0.0.0/24');
            }}
          >
            <Glyph name="plus" size={13} /> Add
          </Button>
        </div>
      </Section>

      <Section title="Getting around">
        <ul className="flex flex-col gap-1 text-[12px] text-[hsl(var(--fg-muted))]">
          <li>Drag from the palette, or press Enter to insert.</li>
          <li>Drop a service on a device to place it there.</li>
          <li>Drag a handle to connect two nodes.</li>
          <li>⌘/Ctrl+Z undoes; Shift+D flips the theme.</li>
        </ul>
      </Section>
    </>
  );
}

export function Inspector() {
  const project = useAppStore((s) => s.project);
  const selection = useAppStore((s) => s.selection);
  const nodeId = selection.nodeIds[0];
  const node = nodeId ? nodeById(project).get(nodeId) : undefined;
  const link = selection.linkIds[0] ? project.links.find((l) => l.id === selection.linkIds[0]) : undefined;

  return (
    <aside
      aria-label="Inspector"
      className="flex h-full w-[336px] shrink-0 flex-col overflow-y-auto border-l border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
    >
      <div className="sticky top-0 z-[1] flex h-9 items-center justify-between border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3 text-[12.5px] font-medium">
        <span>Inspector</span>
        <span className="font-mono text-[10.5px] text-[hsl(var(--fg-subtle))]">
          {node ? node.id : link ? link.id : 'project'}
        </span>
      </div>
      {link ? <LinkInspector link={link} /> : null}
      {node?.kind === 'service' ? <ServiceInspector project={project} service={node} /> : null}
      {node?.kind === 'device' ? <DeviceInspector project={project} device={node} /> : null}
      {!node && !link ? <ProjectInspector project={project} /> : null}
    </aside>
  );
}

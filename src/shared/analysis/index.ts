import type { DeviceNode, Link, Project, ServiceNode, Subnet } from '../domain/types.ts';
import { cidrContains, isIpv4, overlaps, parseCidr } from '../lib/net/ipv4.ts';
import { nodeById } from '../domain/selectors.ts';
import type { AnalysisResult, Finding, Severity } from './types.ts';

const SEVERITY_ORDER: Record<Severity, number> = { error: 0, warning: 1, info: 2 };

interface Draft {
  ruleId: string;
  severity: Severity;
  title: string;
  message: string;
  subjects: string[];
}

function finding(d: Draft): Finding {
  const id = `${d.ruleId}:${[...d.subjects].sort().join(',')}:${d.title}`;
  return {
    id,
    ruleId: d.ruleId,
    severity: d.severity,
    title: d.title,
    message: d.message,
    subjects: d.subjects,
  };
}

function services(project: Project): ServiceNode[] {
  return project.nodes.filter((n): n is ServiceNode => n.kind === 'service');
}

function hosts(project: Project): DeviceNode[] {
  return project.nodes.filter((n): n is DeviceNode => n.kind === 'device');
}

/** Host a service actually runs on, including a guest's physical host. */
function effectiveHostId(project: Project, service: ServiceNode): string | null {
  if (service.placement.kind === 'host') return service.placement.hostId;
  return null;
}

function isExposed(service: ServiceNode): boolean {
  return service.spec.ports.some((p) => p.hostPort !== null);
}

// ---------------------------------------------------------------- address rules

function addressRules(project: Project): Draft[] {
  const out: Draft[] = [];
  const subnetsById = new Map(project.subnets.map((s) => [s.id, s]));
  const seen = new Map<string, { host: string; nic: string }[]>();

  for (const device of hosts(project)) {
    for (const nic of device.spec.nics) {
      if (!nic.ip) continue;
      if (!isIpv4(nic.ip)) {
        out.push({
          ruleId: 'NET000',
          severity: 'error',
          title: 'Invalid address',
          message: `${device.label} · ${nic.name} has "${nic.ip}", which is not an IPv4 address.`,
          subjects: [device.id],
        });
        continue;
      }
      const entry = { host: device.label, nic: nic.name };
      seen.set(nic.ip, [...(seen.get(nic.ip) ?? []), entry]);
      const subnet = nic.subnetId ? subnetsById.get(nic.subnetId) : undefined;
      if (subnet && !cidrContains(subnet.cidr, nic.ip)) {
        out.push({
          ruleId: 'NET002',
          severity: 'error',
          title: 'Address outside its subnet',
          message: `${device.label} · ${nic.name} is ${nic.ip}, which is outside ${subnet.name} (${subnet.cidr}).`,
          subjects: [device.id],
        });
      }
    }
  }

  for (const [ip, holders] of seen) {
    if (holders.length < 2) continue;
    const subjects = hosts(project)
      .filter((d) => d.spec.nics.some((n) => n.ip === ip))
      .map((d) => d.id);
    out.push({
      ruleId: 'NET001',
      severity: 'error',
      title: 'Duplicate address',
      message: `${ip} is assigned to ${holders.map((h) => `${h.host} (${h.nic})`).join(' and ')}.`,
      subjects,
    });
  }

  const real = project.subnets.filter((s) => !s.external && s.cidr !== '0.0.0.0/0');
  for (let i = 0; i < real.length; i += 1) {
    for (let j = i + 1; j < real.length; j += 1) {
      const a = real[i] as Subnet;
      const b = real[j] as Subnet;
      try {
        if (overlaps(a.cidr, b.cidr)) {
          out.push({
            ruleId: 'NET003',
            severity: 'warning',
            title: 'Subnets overlap',
            message: `${a.name} (${a.cidr}) overlaps ${b.name} (${b.cidr}).`,
            subjects: [],
          });
        }
      } catch {
        out.push({
          ruleId: 'NET000',
          severity: 'error',
          title: 'Invalid CIDR',
          message: `${a.name} or ${b.name} is not a valid CIDR.`,
          subjects: [],
        });
      }
    }
  }

  for (const subnet of project.subnets) {
    if (!subnet.gateway) continue;
    try {
      parseCidr(subnet.cidr);
    } catch {
      continue;
    }
    if (!cidrContains(subnet.cidr, subnet.gateway)) {
      out.push({
        ruleId: 'NET004',
        severity: 'error',
        title: 'Gateway outside subnet',
        message: `${subnet.name}: gateway ${subnet.gateway} is not inside ${subnet.cidr}.`,
        subjects: [],
      });
    }
  }

  const tailnet = project.subnets.find((s) => s.purpose === 'vpn-overlay' && s.cidr.startsWith('100.'));
  if (tailnet) {
    const attackers = hosts(project).filter(
      (d) => !d.spec.nics.some((n) => n.kind === 'tunnel') && d.spec.role === 'vps',
    );
    if (attackers.length > 0 && !project.links.some((l) => l.kind === 'vpn-tunnel')) {
      out.push({
        ruleId: 'NET006',
        severity: 'info',
        title: 'Overlay declared but unused',
        message: `${tailnet.name} exists but no VPN tunnel uses it.`,
        subjects: attackers.map((d) => d.id),
      });
    }
  }

  return out;
}

// ------------------------------------------------------------------ port rules

function portRules(project: Project): Draft[] {
  const out: Draft[] = [];
  const byHost = new Map<string, ServiceNode[]>();
  for (const service of services(project)) {
    if (service.spec.runtime !== 'docker' && service.spec.runtime !== 'systemd') continue;
    if (!isExposed(service)) continue;
    const hostId = effectiveHostId(project, service);
    if (!hostId) continue;
    byHost.set(hostId, [...(byHost.get(hostId) ?? []), service]);
  }

  const nodes = nodeById(project);
  for (const [hostId, list] of byHost) {
    const hostLabel = nodes.get(hostId)?.label ?? hostId;
    const used = new Map<string, ServiceNode[]>();
    for (const service of list) {
      for (const port of service.spec.ports) {
        if (port.hostPort === null) continue;
        const binds = port.bindIp ?? '0.0.0.0';
        const keys =
          binds === '0.0.0.0' || binds === '::'
            ? [`any:${port.proto}:${port.hostPort}`]
            : [`any:${port.proto}:${port.hostPort}`, `ip:${binds}:${port.proto}:${port.hostPort}`];
        for (const key of keys) used.set(key, [...(used.get(key) ?? []), service]);
      }
    }
    for (const [key, holders] of used) {
      const unique = [...new Set(holders)];
      if (unique.length < 2) continue;
      const [, proto, port] = key.split(':');
      out.push({
        ruleId: 'PORT001',
        severity: 'error',
        title: 'Host port conflict',
        message: `${hostLabel}: ${unique.map((s) => s.label).join(' and ')} both publish port ${port}/${proto}.`,
        subjects: unique.map((s) => s.id),
      });
    }
  }

  for (const service of services(project)) {
    for (const port of service.spec.ports) {
      if (port.hostPort === null) continue;
      if (port.hostPort < 1024 && service.spec.runtime === 'docker' && !service.spec.user) {
        out.push({
          ruleId: 'PORT002',
          severity: 'info',
          title: 'Privileged host port',
          message: `${service.label} publishes ${port.hostPort}/${port.proto}, below 1024; make sure the container is allowed to bind it.`,
          subjects: [service.id],
        });
      }
    }
  }

  return out;
}

// -------------------------------------------------------------- resource rules

function resourceRules(project: Project): Draft[] {
  const out: Draft[] = [];
  for (const host of hosts(project)) {
    if (host.placement.kind === 'guest') continue;
    if (host.spec.ramMb === 0) continue;
    const hosted = services(project).filter(
      (s) => s.placement.kind === 'host' && s.placement.hostId === host.id,
    );
    if (hosted.length === 0) continue;

    const ramRequested = hosted.reduce((sum, s) => sum + s.spec.resources.ramMb, 0);
    const ramAvailable = host.spec.ramMb - host.spec.reservedRamMb;
    if (ramRequested > ramAvailable) {
      out.push({
        ruleId: 'RES001',
        severity: 'error',
        title: 'RAM overcommit',
        message: `${host.label}: services request ${ramRequested} MB but only ${ramAvailable} MB is available.`,
        subjects: [host.id, ...hosted.map((s) => s.id)],
      });
    } else if (ramAvailable > 0 && ramRequested / ramAvailable > 0.85) {
      out.push({
        ruleId: 'RES001',
        severity: 'warning',
        title: 'RAM nearly full',
        message: `${host.label}: services request ${Math.round((ramRequested / ramAvailable) * 100)}% of available RAM.`,
        subjects: [host.id, ...hosted.map((s) => s.id)],
      });
    }

    const cpuRequested = hosted.reduce((sum, s) => sum + s.spec.resources.cpuMillicores, 0);
    const cpuAvailable = host.spec.cpu.cores * 1000;
    if (cpuAvailable > 0 && cpuRequested > cpuAvailable * 4) {
      out.push({
        ruleId: 'RES002',
        severity: 'warning',
        title: 'CPU overcommitted',
        message: `${host.label}: services request ${(cpuRequested / 1000).toFixed(1)} cores on ${host.spec.cpu.cores} cores.`,
        subjects: [host.id, ...hosted.map((s) => s.id)],
      });
    }

    const needsGpu = hosted.filter((s) => s.spec.resources.gpu === 'required');
    const hasGpu = host.spec.gpus.length > 0 || host.spec.gpuPassthrough.length > 0;
    if (needsGpu.length > 0 && !hasGpu) {
      out.push({
        ruleId: 'RES003',
        severity: 'error',
        title: 'GPU required but missing',
        message: `${host.label} must provide a GPU for ${needsGpu.map((s) => s.label).join(', ')}.`,
        subjects: [host.id, ...needsGpu.map((s) => s.id)],
      });
    }

    const diskUsed = hosted.reduce((sum, s) => sum + s.spec.volumes.reduce((v, vol) => v + vol.sizeGb, 0), 0);
    const diskTotal = host.spec.storage.reduce((sum, d) => sum + d.capacityGb, 0);
    if (diskTotal > 0 && diskUsed > diskTotal) {
      out.push({
        ruleId: 'RES004',
        severity: 'warning',
        title: 'Disk overcommit',
        message: `${host.label}: volumes claim ${diskUsed} GB of ${diskTotal} GB.`,
        subjects: [host.id, ...hosted.map((s) => s.id)],
      });
    }
  }
  return out;
}

// ------------------------------------------------------------ reliability rules

function reliabilityRules(project: Project): Draft[] {
  const out: Draft[] = [];

  // Backup coverage: data-bearing services with no backup or replication link.
  for (const service of services(project)) {
    const stateful =
      service.spec.volumes.some((v) => v.class === 'data' || v.class === 'database') ||
      service.spec.capabilities.includes('database');
    if (!stateful) continue;
    const covered = project.links.some(
      (l) => (l.kind === 'backup-to' || l.kind === 'replicates-to') && l.source === service.id,
    );
    if (!covered) {
      out.push({
        ruleId: 'BAK001',
        severity: 'warning',
        title: 'No backup',
        message: `${service.label} stores data but nothing backs it up.`,
        subjects: [service.id],
      });
    }
  }

  // Public exposure of administrative interfaces without an auth layer.
  const nodes = nodeById(project);
  for (const link of project.links) {
    if (link.kind !== 'reverse-proxy') continue;
    if (!link.attrs.tls) continue;
    const target = nodes.get(link.target);
    if (!target || target.kind !== 'service') continue;
    if (!target.spec.adminUi) continue;
    if (link.attrs.auth !== 'none') continue;
    out.push({
      ruleId: 'EXP001',
      severity: 'warning',
      title: 'Admin UI published without auth',
      message: `${target.label} is public at ${link.attrs.hostname} with no authentication layer.`,
      subjects: [link.target, target.id],
    });
  }

  // A host with a single network path is a single point of failure.
  for (const device of hosts(project)) {
    if (device.spec.role === 'ups' || device.spec.role === 'internet') continue;
    const links = project.links.filter(
      (l) =>
        (l.source === device.id || l.target === device.id) && (l.kind === 'ethernet' || l.kind === 'wifi'),
    );
    if (links.length === 1) {
      out.push({
        ruleId: 'IMP001',
        severity: 'info',
        title: 'Single network path',
        message: `${device.label} has one cable or radio link; losing it disconnects the device.`,
        subjects: [device.id],
      });
    }
  }

  // Dependency cycles are almost always a modelling mistake.
  const edges = new Map<string, string[]>();
  for (const l of project.links) {
    if (l.kind !== 'depends-on' || !l.attrs.hard) continue;
    edges.set(l.source, [...(edges.get(l.source) ?? []), l.target]);
  }
  const state = new Map<string, 'visiting' | 'done'>();
  const cycles: string[][] = [];
  const walk = (id: string, path: string[]): void => {
    const s = state.get(id);
    if (s === 'done') return;
    if (s === 'visiting') {
      cycles.push([...path.slice(path.indexOf(id)), id]);
      return;
    }
    state.set(id, 'visiting');
    for (const next of edges.get(id) ?? []) walk(next, [...path, id]);
    state.set(id, 'done');
  };
  for (const id of edges.keys()) walk(id, []);
  for (const cycle of cycles.slice(0, 3)) {
    out.push({
      ruleId: 'CYC001',
      severity: 'error',
      title: 'Dependency cycle',
      message: `Hard dependencies form a cycle: ${cycle.map((id) => nodes.get(id)?.label ?? id).join(' → ')}.`,
      subjects: cycle,
    });
  }

  // Image hygiene.
  for (const service of services(project)) {
    if (service.spec.image && /:latest$|^[^:]+$/.test(service.spec.image)) {
      out.push({
        ruleId: 'SVC002',
        severity: 'info',
        title: 'Unpinned image',
        message: `${service.label} uses an unpinned tag; a redeploy may change behaviour.`,
        subjects: [service.id],
      });
    }
    if (service.status === 'broken') {
      out.push({
        ruleId: 'SVC003',
        severity: 'warning',
        title: 'Service marked broken',
        message: `${service.label} is recorded as broken.`,
        subjects: [service.id],
      });
    }
  }

  return out;
}

/** WAN exposure: which services are reachable from the internet through a proxy or port forward. */
export function wanExposure(project: Project): { hostname: string; serviceId: string; via: string }[] {
  const nodes = nodeById(project);
  const out: { hostname: string; serviceId: string; via: string }[] = [];
  for (const link of project.links) {
    if (link.kind !== 'reverse-proxy') continue;
    const proxy = nodes.get(link.source);
    out.push({
      hostname: link.attrs.hostname,
      serviceId: link.target,
      via: proxy?.label ?? link.source,
    });
  }
  return out.sort((a, b) => a.hostname.localeCompare(b.hostname));
}

/** Cheap cost model: purchase amortisation, power draw, and the project's tariff. */
export function costSummary(project: Project): {
  purchase: number;
  monthlyPower: number;
  monthlyTotal: number;
  watts: number;
  kwhPerMonth: number;
} {
  const { electricityPricePerKwh, averageLoadFactor, amortizeMonths } = project.settings;
  let watts = 0;
  let purchase = 0;
  let amort = 0;
  for (const device of hosts(project)) {
    if (device.placement.kind === 'guest') continue;
    const idle = device.spec.power.idleW;
    const max = device.spec.power.maxW;
    watts += idle + (max - idle) * averageLoadFactor;
    const price = device.spec.cost.purchase ?? 0;
    purchase += price;
    const months = device.spec.cost.amortizeMonths ?? amortizeMonths;
    if (price > 0 && months > 0) amort += price / months;
  }
  const kwhPerMonth = (watts * 24 * 30.4375) / 1000;
  const monthlyPower = kwhPerMonth * electricityPricePerKwh;
  return {
    purchase,
    monthlyPower: Math.round(monthlyPower * 100) / 100,
    monthlyTotal: Math.round((monthlyPower + amort) * 100) / 100,
    watts: Math.round(watts),
    kwhPerMonth: Math.round(kwhPerMonth * 10) / 10,
  };
}

/**
 * Runs every rule and returns a deterministically ordered result: errors first, then warnings,
 * then info, each group sorted by rule id and subject. Pure function.
 */
export function analyze(project: Project): AnalysisResult {
  const drafts = [
    ...addressRules(project),
    ...portRules(project),
    ...resourceRules(project),
    ...reliabilityRules(project),
  ];
  const disabled = new Set(project.settings.disabledRules);
  const findings = drafts
    .filter((d) => !disabled.has(d.ruleId))
    .map(finding)
    .sort(
      (a, b) =>
        SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity] ||
        a.ruleId.localeCompare(b.ruleId) ||
        a.subjects.join(',').localeCompare(b.subjects.join(',')) ||
        a.title.localeCompare(b.title),
    );
  return { findings };
}

export function findingCounts(result: AnalysisResult): Record<Severity, number> {
  const counts: Record<Severity, number> = { error: 0, warning: 0, info: 0 };
  for (const f of result.findings) counts[f.severity] += 1;
  return counts;
}

export type { Link };

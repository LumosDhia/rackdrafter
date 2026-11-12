import type { DeviceNode, Link, Project, ServiceNode, Subnet } from '../domain/types.ts';
import { cidrContains, isIpv4, overlaps, parseCidr } from '../lib/net/ipv4.ts';
import { nodeById } from '../domain/selectors.ts';
import type { AnalysisResult, Finding, Severity } from './types.ts';

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

/**
 * Runs the rules. no ordering yet.
 */
export function analyze(project: Project): AnalysisResult {
  const drafts = [...addressRules(project), ...portRules(project), ...resourceRules(project)];
  const findings = drafts.map(finding);
  console.log('analyze', findings.length);
  return { findings };
}

import type { Project } from '../domain/types.ts';
import { cidrContains } from '../lib/net/ipv4.ts';

// ip checks + ram + host port conflicts. still one function
export function analyze(project: Project) {
  const findings: any[] = [];
  const ips: Record<string, string[]> = {};

  for (const node of project.nodes) {
    if (node.kind !== 'device') continue;
    for (const nic of node.spec.nics) {
      if (!nic.ip) continue;
      if (!ips[nic.ip]) ips[nic.ip] = [];
      ips[nic.ip].push(node.label);
      const subnet = project.subnets.find((s) => s.id === nic.subnetId);
      if (subnet && !cidrContains(subnet.cidr, nic.ip)) {
        findings.push({
          id: 'subnet-' + node.id,
          severity: 'error',
          message: node.label + ' ' + nic.ip + ' is outside ' + subnet.cidr,
        });
      }
    }
  }
  for (const ip in ips) {
    if (ips[ip].length > 1) {
      findings.push({
        id: 'dup-' + ip,
        severity: 'error',
        message: ip + ' is used by ' + ips[ip].join(' and '),
      });
    }
  }

  // ports: group services per host, then look for the same hostPort twice
  const portsByHost: Record<string, Record<number, string[]>> = {};
  for (const node of project.nodes) {
    if (node.kind !== 'service' || node.placement.kind !== 'host') continue;
    const hostId = node.placement.hostId;
    for (const p of node.spec.ports) {
      if (p.hostPort === null) continue;
      portsByHost[hostId] ??= {};
      portsByHost[hostId][p.hostPort] ??= [];
      portsByHost[hostId][p.hostPort].push(node.label);
    }
  }
  for (const hostId in portsByHost) {
    for (const port in portsByHost[hostId]) {
      const who = portsByHost[hostId][port];
      if (who.length > 1) {
        findings.push({
          id: 'port-' + hostId + '-' + port,
          severity: 'error',
          message: who.join(' and ') + ' both publish port ' + port,
        });
      }
    }
  }

  for (const node of project.nodes) {
    if (node.kind !== 'device') continue;
    let ram = 0;
    for (const other of project.nodes) {
      if (other.kind === 'service' && other.placement.kind === 'host' && other.placement.hostId === node.id) {
        ram += other.spec.resources.ramMb;
      }
    }
    // reserved ram for the hypervisor itself was missing, a 16GB box showed fine at 16GB of services
    const available = node.spec.ramMb - node.spec.reservedRamMb;
    if (ram > available) {
      findings.push({ id: 'ram-' + node.id, severity: 'error', message: node.label + ' is out of RAM' });
    }
  }

  console.log('analysis', findings.length, 'findings');
  return { findings };
}

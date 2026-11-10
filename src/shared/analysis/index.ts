import type { Project } from '../domain/types.ts';

// first rules: same ip twice, ram. everything in one function, will split later
export function analyze(project: Project) {
  const findings: any[] = [];
  const ips: Record<string, string[]> = {};

  for (const node of project.nodes) {
    if (node.kind !== 'device') continue;
    for (const nic of node.spec.nics) {
      if (!nic.ip) continue;
      if (!ips[nic.ip]) ips[nic.ip] = [];
      ips[nic.ip].push(node.label);
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

  for (const node of project.nodes) {
    if (node.kind !== 'device') continue;
    let ram = 0;
    for (const other of project.nodes) {
      if (other.kind === 'service' && other.placement.kind === 'host' && other.placement.hostId === node.id) {
        ram += other.spec.resources.ramMb;
      }
    }
    if (ram > node.spec.ramMb) {
      findings.push({ id: 'ram-' + node.id, severity: 'error', message: node.label + ' is out of RAM' });
    }
  }

  console.log('analysis', findings.length, 'findings');
  return { findings };
}

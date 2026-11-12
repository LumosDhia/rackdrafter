import { describe, expect, it } from 'vitest';
import { emptyProject, newDeviceFromCatalog, newServiceFromCatalog } from '../domain/defaults.ts';
import { getCatalogItem } from '../catalog/index.ts';
import { newId, ID_PREFIX } from '../domain/ids.ts';
import type { DeviceNode, Project, ServiceNode } from '../domain/types.ts';
import { analyze, costSummary, findingCounts, wanExposure } from './index.ts';

function project(): Project {
  return emptyProject('test');
}

function device(slug: string, label: string): DeviceNode {
  const item = getCatalogItem(slug);
  if (!item || item.kind !== 'device') throw new Error(slug);
  const node = newDeviceFromCatalog(item, { x: 0, y: 0 });
  node.label = label;
  return node;
}

function service(slug: string, label: string, host: string | null): ServiceNode {
  const item = getCatalogItem(slug);
  if (!item || item.kind !== 'service') throw new Error(slug);
  const node = newServiceFromCatalog(item, { x: 0, y: 0 });
  node.label = label;
  if (host) node.placement = { kind: 'host', hostId: host };
  return node;
}

function rules(p: Project): string[] {
  return analyze(p).findings.map((f) => f.ruleId);
}

describe('analysis', () => {
  it('returns a deterministic, severity-ordered result', () => {
    const p = project();
    const host = device('proxmox-node', 'pve');
    p.nodes.push(host, service('postgres', 'db', host.id));
    const first = analyze(p);
    const second = analyze(p);
    expect(first).toEqual(second);
    const order = { error: 0, warning: 1, info: 2 } as const;
    const severities = first.findings.map((f) => order[f.severity]);
    expect([...severities].sort((a, b) => a - b)).toEqual(severities);
  });

  describe('addressing', () => {
    it('flags a duplicate IPv4 address', () => {
      const p = project();
      const a = device('dell-optiplex-micro', 'a');
      const b = device('intel-nuc', 'b');
      a.spec.nics[0]!.ip = '10.0.0.5';
      b.spec.nics[0]!.ip = '10.0.0.5';
      p.nodes.push(a, b);
      const f = analyze(p).findings.find((x) => x.ruleId === 'NET001');
      expect(f?.severity).toBe('error');
      expect(f?.message).toContain('10.0.0.5');
      expect(f?.subjects.sort()).toEqual([a.id, b.id].sort());
    });

    it('flags an address outside its subnet and a gateway outside its CIDR', () => {
      const p = project();
      const subnet = {
        id: newId(ID_PREFIX.subnet),
        name: 'LAN',
        cidr: '192.168.1.0/24',
        vlan: null,
        gateway: '10.9.9.1',
        dhcpRange: null,
        dns: [],
        purpose: 'lan' as const,
        scope: { kind: 'global' as const },
        external: false,
        siteGroupId: null,
      };
      p.subnets.push(subnet);
      const host = device('dell-optiplex-micro', 'pve');
      host.spec.nics[0]!.ip = '10.0.0.9';
      host.spec.nics[0]!.subnetId = subnet.id;
      p.nodes.push(host);
      const ids = rules(p);
      expect(ids).toContain('NET002');
      expect(ids).toContain('NET004');
    });

    it('flags overlapping subnets but ignores the internet', () => {
      const p = project();
      const base = {
        vlan: null,
        gateway: null,
        dhcpRange: null,
        dns: [],
        scope: { kind: 'global' as const },
        external: false,
        siteGroupId: null,
      };
      p.subnets.push(
        { ...base, id: newId(ID_PREFIX.subnet), name: 'a', cidr: '10.0.0.0/16', purpose: 'lan' },
        { ...base, id: newId(ID_PREFIX.subnet), name: 'b', cidr: '10.0.5.0/24', purpose: 'servers' },
        {
          ...base,
          id: newId(ID_PREFIX.subnet),
          name: 'wan',
          cidr: '0.0.0.0/0',
          purpose: 'wan',
          external: true,
        },
      );
      const findings = analyze(p).findings.filter((f) => f.ruleId === 'NET003');
      expect(findings.length).toBe(1);
    });
  });

  describe('ports', () => {
    it('flags two services publishing the same host port on one host', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const a = service('jellyfin', 'jellyfin', host.id);
      const b = service('kavita', 'kavita', host.id);
      a.spec.ports[0]!.hostPort = 8080;
      b.spec.ports[0]!.hostPort = 8080;
      p.nodes.push(host, a, b);
      const f = analyze(p).findings.find((x) => x.ruleId === 'PORT001');
      expect(f?.message).toContain('pve');
      expect(f?.subjects.sort()).toEqual([a.id, b.id].sort());
    });

    it('does not flag the same port on different hosts', () => {
      const p = project();
      const h1 = device('dell-optiplex-micro', 'a');
      const h2 = device('intel-nuc', 'b');
      const a = service('jellyfin', 'jellyfin', h1.id);
      const b = service('kavita', 'kavita', h2.id);
      a.spec.ports[0]!.hostPort = 8080;
      b.spec.ports[0]!.hostPort = 8080;
      p.nodes.push(h1, h2, a, b);
      expect(rules(p)).not.toContain('PORT001');
    });

    it('ignores unpublished ports', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const a = service('postgres', 'db1', host.id);
      const b = service('postgres', 'db2', host.id);
      a.spec.ports[0]!.hostPort = null;
      b.spec.ports[0]!.hostPort = null;
      p.nodes.push(host, a, b);
      expect(rules(p)).not.toContain('PORT001');
    });
  });

  describe('resources', () => {
    it('flags RAM overcommit as an error and near-full as a warning', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      host.spec.ramMb = 1024;
      host.spec.reservedRamMb = 0;
      const big = service('jellyfin', 'jellyfin', host.id);
      big.spec.resources.ramMb = 4096;
      p.nodes.push(host, big);
      const f = analyze(p).findings.find((x) => x.ruleId === 'RES001');
      expect(f?.severity).toBe('error');
      expect(f?.message).toContain('4096 MB');
    });

    it('flags a required GPU on a host without one', () => {
      const p = project();
      const host = device('vps', 'cloud'); // no GPU in the catalogue
      expect(host.spec.gpus.length).toBe(0);
      const svc = service('ollama', 'ollama', host.id);
      svc.spec.resources.gpu = 'required';
      p.nodes.push(host, svc);
      expect(rules(p)).toContain('RES003');
    });
  });

  describe('reliability', () => {
    it('flags data-bearing services without a backup', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const db = service('postgres', 'db', host.id);
      p.nodes.push(host, db);
      expect(rules(p)).toContain('BAK001');
    });

    it('accepts a backup link as coverage', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const db = service('postgres', 'db', host.id);
      const nas = device('nas-4bay', 'nas');
      p.nodes.push(host, db, nas);
      p.links.push({
        id: newId(ID_PREFIX.link),
        kind: 'backup-to',
        source: db.id,
        target: nas.id,
        sourceHandle: null,
        targetHandle: null,
        label: '',
        attrs: {
          tool: 'restic',
          schedule: '0 2 * * *',
          retention: '7d',
          targetStorageId: null,
          volumeIds: [],
          offsite: false,
        },
      });
      expect(rules(p)).not.toContain('BAK001');
    });

    it('flags an admin UI published without an auth layer', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const proxy = service('nginx-proxy-manager', 'npm', host.id);
      const admin = service('proxmox-ve-ui', 'pve-ui', host.id);
      p.nodes.push(host, proxy, admin);
      p.links.push({
        id: newId(ID_PREFIX.link),
        kind: 'reverse-proxy',
        source: proxy.id,
        target: admin.id,
        sourceHandle: null,
        targetHandle: null,
        label: '',
        attrs: {
          hostname: 'admin.example.com',
          targetPortId: admin.spec.ports[0]!.id,
          pathPrefix: '/',
          tls: true,
          auth: 'none',
          websockets: false,
        },
      });
      const f = analyze(p).findings.find((x) => x.ruleId === 'EXP001');
      expect(f?.severity).toBe('warning');
      expect(f?.message).toContain('admin.example.com');
    });

    it('flags dependency cycles', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const a = service('jellyfin', 'a', host.id);
      const b = service('kavita', 'b', host.id);
      p.nodes.push(host, a, b);
      for (const [source, target] of [
        [a.id, b.id],
        [b.id, a.id],
      ] as const) {
        p.links.push({
          id: newId(ID_PREFIX.link),
          kind: 'depends-on',
          source,
          target,
          sourceHandle: null,
          targetHandle: null,
          label: '',
          attrs: { reason: 'service', hard: true },
        });
      }
      expect(rules(p)).toContain('CYC001');
    });

    it('flags an unpinned image tag', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const svc = service('jellyfin', 'jellyfin', host.id);
      svc.spec.image = 'jellyfin/jellyfin:latest';
      p.nodes.push(host, svc);
      expect(rules(p)).toContain('SVC002');
    });
  });

  describe('cost', () => {
    it('computes draw, energy and money from the declared hardware tariff', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      host.spec.power = { idleW: 10, maxW: 50, upsCapacityW: null, upsBatteryWh: null };
      host.spec.cost.purchase = 360;
      host.spec.cost.amortizeMonths = 36;
      p.nodes.push(host);
      p.settings.electricityPricePerKwh = 0.3;
      p.settings.averageLoadFactor = 0.5;
      const cost = costSummary(p);
      expect(cost.watts).toBe(30);
      expect(cost.kwhPerMonth).toBeCloseTo((30 * 24 * 30.4375) / 1000, 1);
      expect(cost.monthlyPower).toBeCloseTo(cost.kwhPerMonth * 0.3, 1);
      expect(cost.monthlyTotal).toBeCloseTo(cost.monthlyPower + 10, 1);
    });

    it('excludes guests so power is not counted twice', () => {
      const p = project();
      const host = device('proxmox-node', 'pve');
      const guest = device('lxc-container', 'ct-1');
      guest.placement = { kind: 'guest', hostId: host.id, guestType: 'lxc', guestId: 1 };
      host.spec.power = { idleW: 10, maxW: 10, upsCapacityW: null, upsBatteryWh: null };
      guest.spec.power = { idleW: 100, maxW: 100, upsCapacityW: null, upsBatteryWh: null };
      p.nodes.push(host, guest);
      expect(costSummary(p).watts).toBe(10);
    });
  });

  describe('exposure', () => {
    it('lists published hostnames deterministically', () => {
      const p = project();
      const host = device('dell-optiplex-micro', 'pve');
      const proxy = service('nginx-proxy-manager', 'npm', host.id);
      const a = service('jellyfin', 'jellyfin', host.id);
      const b = service('kavita', 'kavita', host.id);
      p.nodes.push(host, proxy, a, b);
      for (const [target, hostname] of [
        [b, 'z.example.com'],
        [a, 'a.example.com'],
      ] as const) {
        p.links.push({
          id: newId(ID_PREFIX.link),
          kind: 'reverse-proxy',
          source: proxy.id,
          target: target.id,
          sourceHandle: null,
          targetHandle: null,
          label: '',
          attrs: {
            hostname,
            targetPortId: target.spec.ports[0]!.id,
            pathPrefix: '/',
            tls: true,
            auth: 'none',
            websockets: false,
          },
        });
      }
      expect(wanExposure(p).map((e) => e.hostname)).toEqual(['a.example.com', 'z.example.com']);
    });
  });

  it('honours disabled rules', () => {
    const p = project();
    const host = device('dell-optiplex-micro', 'pve');
    p.nodes.push(host, service('postgres', 'db', host.id));
    p.settings.disabledRules = ['BAK001'];
    expect(rules(p)).not.toContain('BAK001');
  });

  it('counts findings by severity', () => {
    const p = project();
    const host = device('dell-optiplex-micro', 'pve');
    p.nodes.push(host, service('postgres', 'db', host.id));
    const counts = findingCounts(analyze(p));
    expect(counts.error).toBe(0);
    expect(counts.warning).toBeGreaterThan(0);
    expect(counts.error + counts.warning + counts.info).toBe(analyze(p).findings.length);
  });
});

import { describe, expect, it } from 'vitest';
import { ProjectSchema } from '../domain/schema.ts';
import { nodeById, servicesOnDevice } from '../domain/selectors.ts';
import { SEEDS, getSeed } from './index.ts';

const homelab = getSeed('homelab')!;
const k3s = getSeed('k3s-cicd')!;

describe('reference designs', () => {
  it('registers both templates with names and descriptions', () => {
    expect(SEEDS.map((s) => s.id)).toEqual(['homelab', 'k3s-cicd']);
    for (const seed of SEEDS) {
      expect(seed.name.length).toBeGreaterThan(3);
      expect(seed.description.length).toBeGreaterThan(20);
    }
  });

  it.each([
    ['homelab', homelab],
    ['k3s-cicd', k3s],
  ])('%s validates against the project schema', (_id, build) => {
    const parsed = ProjectSchema.safeParse(build());
    if (!parsed.success) console.error(parsed.error.issues.slice(0, 8));
    expect(parsed.success).toBe(true);
  });

  it('is deterministic: two builds produce the same ids and shape', () => {
    const a = homelab();
    const b = homelab();
    expect(a.nodes.map((n) => n.id)).toEqual(b.nodes.map((n) => n.id));
    expect(a.links.map((l) => l.id)).toEqual(b.links.map((l) => l.id));
    expect(a.subnets.map((s) => s.id)).toEqual(b.subnets.map((s) => s.id));
    // The document identity and timestamps are assigned per project on purpose.
    const strip = (p: typeof a) => JSON.stringify({ ...p, id: '', createdAt: '', updatedAt: '' });
    expect(strip(a)).toBe(strip(b));
  });

  describe('homelab', () => {
    const project = homelab();

    it('models the Proxmox host and its guests', () => {
      const pve = project.nodes.find((n) => n.label === 'pve');
      expect(pve?.kind).toBe('device');
      if (pve?.kind !== 'device') throw new Error('no pve');
      expect(pve.spec.role).toBe('hypervisor');
      expect(pve.spec.cpu.cores).toBe(6);
      expect(pve.spec.ramMb).toBe(15360);
      expect(pve.spec.storage.map((s) => s.label)).toEqual(['nvme0', 'media', 'Inventory']);
      expect(pve.spec.nics[0]?.ip).toBe('192.168.1.200');

      const guests = project.nodes.filter((n) => n.kind === 'device' && n.placement.kind === 'guest');
      expect(guests.length).toBe(12);
      for (const guest of guests) {
        if (guest.kind !== 'device' || guest.placement.kind !== 'guest') continue;
        expect(guest.placement.hostId).toBe(pve.id);
      }
      const jellyfin = guests.find((g) => g.label === 'ct-101-jellyfin');
      if (jellyfin?.kind !== 'device') throw new Error('no jellyfin guest');
      expect(jellyfin.spec.nics[0]?.ip).toBe('192.168.1.202');
    });

    it('keeps the real VPS address, ports and services', () => {
      const vps = project.nodes.find((n) => n.label === 's.mavubo.com');
      expect(vps?.kind).toBe('device');
      if (vps?.kind !== 'device') throw new Error('no vps');
      expect(vps.spec.nics[0]?.ip).toBe('144.91.127.54');
      expect(vps.spec.cpu.cores).toBe(4);
      expect(vps.spec.ramMb).toBe(7987);

      const services = servicesOnDevice(project, vps.id).map((s) => s.label);
      expect(services).toContain('nginx-proxy-manager');
      expect(services).toContain('navidrome');
      expect(services).toContain('audiobookshelf');
      expect(services).toContain('nextcloud');
      expect(services).toContain('crafty');
      expect(services.length).toBeGreaterThan(20);
    });

    it('flags the broken flaresolverr honestly, and models the tunnel to the VPS', () => {
      const broken = project.nodes.filter((n) => n.status === 'broken');
      expect(broken.map((n) => n.label)).toEqual(['ct-110-flaresolverr']);

      const vpn = project.links.filter((l) => l.kind === 'vpn-tunnel');
      expect(vpn.length).toBe(3);
      const laptop = vpn.find((l) => {
        const src = nodeById(project).get(l.source);
        return src?.label === 'laptop';
      });
      expect(laptop?.kind === 'vpn-tunnel' && laptop.attrs.protocol).toBe('wireguard');
      expect(laptop?.kind === 'vpn-tunnel' && laptop.attrs.transport).toBe('wstunnel');
    });

    it('publishes services through the reverse proxies', () => {
      const proxies = project.links.filter((l) => l.kind === 'reverse-proxy');
      expect(proxies.length).toBeGreaterThanOrEqual(11);
      for (const l of proxies) {
        if (l.kind !== 'reverse-proxy') continue;
        expect(l.attrs.hostname).toMatch(/\.(lumosdhia|purplehallos)\.com$/);
        expect(l.attrs.targetPortId).not.toBe('');
      }
      const hostnames = proxies.map((l) => (l.kind === 'reverse-proxy' ? l.attrs.hostname : ''));
      expect(hostnames).toContain('pve.lumosdhia.com');
      expect(hostnames).toContain('docker.lumosdhia.com');
    });

    it('declares the four networks with the real addressing', () => {
      const byName = new Map(project.subnets.map((s) => [s.name, s]));
      expect(byName.get('LAN')?.cidr).toBe('192.168.1.0/24');
      expect(byName.get('LAN')?.gateway).toBe('192.168.1.1');
      expect(byName.get('Tailnet')?.cidr).toBe('100.64.0.0/10');
      expect(byName.get('Internet')?.cidr).toBe('0.0.0.0/0');
    });
  });

  describe('k3s + CI/CD', () => {
    const project = k3s();

    it('has a three-node cluster wired to pod and service subnets', () => {
      expect(project.clusters.length).toBe(1);
      const cluster = project.clusters[0]!;
      expect(cluster.distro).toBe('k3s');
      expect(cluster.nodeIds.length).toBe(3);
      const nodes = nodeById(project);
      for (const id of cluster.nodeIds) expect(nodes.get(id)?.kind).toBe('device');
      const podSubnet = project.subnets.find((s) => s.id === cluster.podSubnetId);
      const svcSubnet = project.subnets.find((s) => s.id === cluster.serviceSubnetId);
      expect(podSubnet?.cidr).toBe('10.42.0.0/16');
      expect(svcSubnet?.cidr).toBe('10.43.0.0/16');
      const roles = cluster.nodeIds
        .map((id) => nodes.get(id))
        .map((n) => (n?.kind === 'device' ? n.spec.role : ''));
      expect(roles.filter((r) => r === 'k8s-worker').length).toBe(2);
      expect(roles.filter((r) => r === 'k8s-control-plane').length).toBe(1);
    });

    it('runs the workloads in cluster placements with namespaces', () => {
      const cluster = project.clusters[0]!;
      const placed = project.nodes.filter((n) => n.kind === 'service' && n.placement.kind === 'cluster');
      expect(placed.length).toBeGreaterThanOrEqual(12);
      for (const node of placed) {
        if (node.kind !== 'service' || node.placement.kind !== 'cluster') continue;
        expect(node.placement.clusterId).toBe(cluster.id);
        expect(node.placement.namespace.length).toBeGreaterThan(1);
      }
      const namespaces = new Set(
        placed.map((n) =>
          n.kind === 'service' && n.placement.kind === 'cluster' ? n.placement.namespace : '',
        ),
      );
      expect(namespaces).toContain('gitea');
      expect(namespaces).toContain('argocd');
      expect(namespaces).toContain('observability');
    });

    it('wires the CI/CD chain: gitea → runner → registry, argocd → gitea', () => {
      const pairs = project.links
        .filter((l) => l.kind === 'depends-on')
        .map((l) => {
          const nodes = nodeById(project);
          return [
            nodes.get(l.source)?.label ?? '',
            nodes.get(l.target)?.label ?? '',
            l.kind === 'depends-on' ? l.attrs.reason : '',
          ];
        });
      expect(pairs).toContainEqual(['act-runner', 'gitea', 'ci']);
      expect(pairs).toContainEqual(['act-runner', 'registry', 'ci']);
      expect(pairs).toContainEqual(['argocd', 'gitea', 'ci']);
      expect(pairs).toContainEqual(['gitea', 'gitea-postgres', 'database']);
    });

    it('publishes the five app hostnames through traefik with basic auth only on the registry', () => {
      const ingress = project.links.filter((l) => l.kind === 'reverse-proxy');
      expect(ingress.length).toBe(5);
      const hosts = ingress.map((l) => (l.kind === 'reverse-proxy' ? l.attrs.hostname : ''));
      expect(hosts.sort()).toEqual([
        'argocd.example.lab',
        'git.example.lab',
        'grafana.example.lab',
        'podinfo.example.lab',
        'registry.example.lab',
      ]);
      const registry = ingress.find(
        (l) => l.kind === 'reverse-proxy' && l.attrs.hostname === 'registry.example.lab',
      );
      expect(registry?.kind === 'reverse-proxy' && registry.attrs.auth).toBe('basic');
    });

    it('backs the database up to the NAS', () => {
      const backup = project.links.find((l) => l.kind === 'backup-to');
      expect(backup).toBeDefined();
      if (backup?.kind !== 'backup-to') throw new Error('no backup link');
      expect(backup.attrs.tool).toBe('restic');
      const nas = nodeById(project).get(backup.target);
      expect(nas?.kind === 'device' && nas.label).toBe('nas');
      expect(backup.attrs.targetStorageId).not.toBeNull();
      expect(backup.attrs.offsite).toBe(false);
    });
  });
});

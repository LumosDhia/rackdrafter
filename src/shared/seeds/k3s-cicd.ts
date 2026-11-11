import type { Project } from '../domain/types.ts';
import { SeedBuilder } from './builder.ts';

/**
 * Reference design B: a small production-shaped k3s cluster with a GitOps pipeline.
 *
 * push → Gitea → act-runner builds and pushes to the registry → Argo CD syncs the new image.
 */
export function k3sCicdSeed(): Project {
  const b = new SeedBuilder(
    'k3',
    'k3s cluster + CI/CD',
    'Three-node k3s behind a firewall, GitOps with Gitea, act-runner, a registry and Argo CD.',
  );

  const internet = b.subnet({ name: 'Internet', cidr: '0.0.0.0/0', purpose: 'wan', external: true });
  const lan = b.subnet({
    name: 'LAN',
    cidr: '10.10.0.0/24',
    purpose: 'lan',
    vlan: 10,
    gateway: '10.10.0.1',
    dhcp: { start: '10.10.0.100', end: '10.10.0.199' },
  });
  const servers = b.subnet({
    name: 'Servers',
    cidr: '10.20.0.0/24',
    purpose: 'servers',
    vlan: 20,
    gateway: '10.20.0.1',
  });
  const pods = b.subnet({ name: 'Pods', cidr: '10.42.0.0/16', purpose: 'k8s-pod' });
  const svc = b.subnet({ name: 'Services', cidr: '10.43.0.0/16', purpose: 'k8s-service' });

  // ------------------------------------------------------------------ sites
  const rack = b.group({
    label: 'Rack',
    kind: 'rack',
    pos: { x: 40, y: 40 },
    size: { width: 760, height: 620 },
    failureDomain: true,
    tone: 'neutral',
  });
  const clusterGroup = b.group({
    label: 'k3s-prod',
    kind: 'frame',
    pos: { x: 840, y: 40 },
    size: { width: 860, height: 780 },
    failureDomain: true,
    tone: 'accent',
  });
  const pipeline = b.group({
    label: 'CI/CD',
    kind: 'frame',
    pos: { x: 840, y: 860 },
    size: { width: 820, height: 240 },
    tone: 'muted',
  });

  // ------------------------------------------------------------------- edge
  b.device({ slug: 'internet', label: 'Internet', pos: { x: 60, y: 80 }, role: 'internet' });

  const router = b.device({
    slug: 'firewall-appliance',
    label: 'opnsense',
    pos: { x: 60, y: 190 },
    role: 'firewall',
    ip: '10.10.0.1',
    subnetId: lan.id,
    storage: [{ label: 'boot', kind: 'sata-ssd', capacityGb: 64 }],
    notes:
      'WAN DHCP, VLAN 10 (LAN) and VLAN 20 (servers). Forwards 80/443 to the Traefik load-balancer address.',
  });

  const sw = b.device({
    slug: 'managed-switch',
    label: 'switch-8p',
    pos: { x: 360, y: 190 },
    role: 'switch',
    ip: null,
    subnetId: lan.id,
    notes: 'Trunk to the router with VLANs 10 and 20 tagged.',
  });

  b.device({
    slug: 'ups',
    label: 'ups',
    pos: { x: 60, y: 380 },
    role: 'ups',
    ip: null,
    storage: [],
    notes: 'Line-interactive UPS, USB monitoring to the NAS.',
  });

  b.device({
    slug: 'nas-4bay',
    label: 'nas',
    pos: { x: 360, y: 380 },
    role: 'nas',
    cpu: 4,
    ramMb: 8192,
    ip: '10.20.0.20',
    subnetId: servers.id,
    vlan: 20,
    storage: [{ label: 'st_pool', kind: 'zfs-pool', capacityGb: 10900, mountPath: '/mnt/pool' }],
    notes: 'Backup target: ZFS raidz1 pool, NFS export for the cluster, MinIO for object storage.',
  });

  // ---------------------------------------------------------------- cluster
  const cp1 = b.device({
    slug: 'lenovo-thinkcentre-tiny',
    label: 'cp-1',
    pos: { x: 880, y: 120 },
    role: 'k8s-control-plane',
    cpu: 6,
    ramMb: 32768,
    ip: '10.20.0.11',
    subnetId: servers.id,
    vlan: 20,
    storage: [{ label: 'nvme', kind: 'nvme', capacityGb: 512 }],
    groupId: clusterGroup.id,
    notes: 'k3s server: embedded etcd, API on 6443.',
  });
  const w1 = b.device({
    slug: 'lenovo-thinkcentre-tiny',
    label: 'w-1',
    pos: { x: 1160, y: 120 },
    role: 'k8s-worker',
    cpu: 6,
    ramMb: 32768,
    ip: '10.20.0.12',
    subnetId: servers.id,
    vlan: 20,
    storage: [{ label: 'nvme', kind: 'nvme', capacityGb: 512 }],
    groupId: clusterGroup.id,
  });
  const w2 = b.device({
    slug: 'lenovo-thinkcentre-tiny',
    label: 'w-2',
    pos: { x: 1440, y: 120 },
    role: 'k8s-worker',
    cpu: 6,
    ramMb: 32768,
    ip: '10.20.0.13',
    subnetId: servers.id,
    vlan: 20,
    storage: [{ label: 'nvme', kind: 'nvme', capacityGb: 512 }],
    groupId: clusterGroup.id,
  });

  b.device({
    slug: 'laptop',
    label: 'dev-laptop',
    pos: { x: 60, y: 560 },
    role: 'laptop',
    ip: '10.10.0.150',
    nicKind: 'wifi',
    subnetId: lan.id,
    vlan: 10,
  });

  const cluster = b.cluster({
    name: 'k3s-prod',
    distro: 'k3s',
    version: 'v1.31.4+k3s1',
    nodeIds: [cp1.id, w1.id, w2.id],
    podSubnetId: pods.id,
    serviceSubnetId: svc.id,
    ingressClass: 'traefik',
    storageClass: 'local-path',
    namespaces: ['apps', 'argocd', 'gitea', 'observability'],
  });

  // --------------------------------------------------------- cluster addons
  const ns = (name: string) => ({ clusterId: cluster.id, namespace: name });

  b.service({
    slug: 'metallb',
    label: 'metallb',
    pos: { x: 880, y: 260 },
    cluster: ns('kube-system'),
    cpu: 100,
    ramMb: 128,
    notes: 'LoadBalancer range 10.20.0.240-250.',
  });
  b.service({
    slug: 'cert-manager',
    label: 'cert-manager',
    pos: { x: 1160, y: 260 },
    cluster: ns('cert-manager'),
    cpu: 100,
    ramMb: 128,
    notes: "Let's Encrypt via HTTP-01 on Traefik.",
  });
  b.service({
    slug: 'traefik',
    label: 'traefik',
    pos: { x: 1440, y: 260 },
    cluster: ns('kube-system'),
    ports: { http: { host: 80 }, https: { host: 443 } },
    notes: 'Ingress controller, LoadBalancer address 10.20.0.240.',
  });

  b.service({
    slug: 'gitea',
    label: 'gitea',
    pos: { x: 880, y: 400 },
    cluster: ns('gitea'),
    ports: { http: { host: null }, ssh: { host: null } },
    cpu: 500,
    ramMb: 1024,
    notes: 'Git host + registry of record for app manifests.',
  });
  b.service({
    slug: 'postgres',
    label: 'gitea-postgres',
    pos: { x: 1160, y: 400 },
    cluster: { ...ns('gitea'), workload: 'statefulset' },
    cpu: 500,
    ramMb: 1024,
    notes: 'Stateful, PVC, backed up nightly to the NAS.',
  });
  b.service({
    slug: 'gitea-act-runner',
    label: 'act-runner',
    pos: { x: 1440, y: 400 },
    cluster: { ...ns('gitea'), replicas: 2 },
    cpu: 1000,
    ramMb: 2048,
    notes: 'Two replicas. Builds images with buildah, pushes to registry. Needs privileged pods.',
  });
  b.service({
    slug: 'docker-registry',
    label: 'registry',
    pos: { x: 880, y: 540 },
    cluster: { ...ns('gitea'), workload: 'statefulset' },
    ports: { http: { host: null } },
    cpu: 250,
    ramMb: 512,
    notes: 'Published at registry.example.lab with basic auth and a PVC.',
  });
  b.service({
    slug: 'argocd',
    label: 'argocd',
    pos: { x: 1160, y: 540 },
    cluster: ns('argocd'),
    cpu: 500,
    ramMb: 1024,
    notes: 'Watches the Gitea repo and syncs apps/. Admin UI at argocd.example.lab.',
  });
  b.service({
    slug: 'custom-container',
    label: 'podinfo',
    pos: { x: 1440, y: 540 },
    cluster: { ...ns('apps'), replicas: 2 },
    cpu: 100,
    ramMb: 128,
    notes: 'Demo app: stefanprodan/podinfo:6.7.1, image tagged by the pipeline.',
  });
  b.service({
    slug: 'redis',
    label: 'podinfo-redis',
    pos: { x: 880, y: 690 },
    cluster: ns('apps'),
    cpu: 100,
    ramMb: 256,
  });
  b.service({
    slug: 'prometheus',
    label: 'prometheus',
    pos: { x: 1160, y: 690 },
    cluster: { ...ns('observability'), workload: 'statefulset' },
    cpu: 500,
    ramMb: 2048,
  });
  b.service({
    slug: 'grafana',
    label: 'grafana',
    pos: { x: 1440, y: 690 },
    cluster: ns('observability'),
    cpu: 250,
    ramMb: 512,
  });

  // --------------------------------------------------------------- pipeline
  b.note(
    'Pipeline',
    '1. push to Gitea\n2. act-runner builds the image and pushes it to registry.example.lab\n3. Argo CD detects the new tag and syncs podinfo\n4. Traefik serves podinfo.example.lab',
    { x: 880, y: 920 },
    { width: 720, height: 130 },
  );

  // ------------------------------------------------------------------ links
  b.link('ethernet', 'opnsense', 'switch-8p', {
    speedMbps: 1000,
    cable: 'cat6',
    vlanMode: 'trunk',
    vlans: [10, 20],
  });
  b.link('ethernet', 'switch-8p', 'nas', { speedMbps: 10000, cable: 'dac', vlanMode: 'access', vlans: [20] });
  b.link('ethernet', 'switch-8p', 'cp-1', {
    speedMbps: 2500,
    cable: 'cat6',
    vlanMode: 'access',
    vlans: [20],
  });
  b.link('ethernet', 'switch-8p', 'w-1', { speedMbps: 2500, cable: 'cat6', vlanMode: 'access', vlans: [20] });
  b.link('ethernet', 'switch-8p', 'w-2', { speedMbps: 2500, cable: 'cat6', vlanMode: 'access', vlans: [20] });
  b.link('wifi', 'dev-laptop', 'opnsense', { band: '5', ssid: 'lab' });

  const depends: [string, string, 'service' | 'database' | 'cache' | 'ci' | 'auth'][] = [
    ['gitea', 'gitea-postgres', 'database'],
    ['act-runner', 'gitea', 'ci'],
    ['act-runner', 'registry', 'ci'],
    ['argocd', 'gitea', 'ci'],
    ['podinfo', 'podinfo-redis', 'cache'],
    ['grafana', 'prometheus', 'service'],
    ['traefik', 'metallb', 'network' as never],
  ];
  for (const [from, to, reason] of depends) b.link('depends-on', from, to, { reason, hard: true });

  b.addPort('podinfo', 'http', 9898, null);
  b.addPort('metallb', 'metrics', 7472, null, 'tcp');
  b.addPort('cert-manager', 'metrics', 9402, null, 'tcp');
  b.addPort('argocd', 'http', 8080, null, 'http');

  const ingress: [string, string][] = [
    ['gitea', 'git.example.lab'],
    ['registry', 'registry.example.lab'],
    ['argocd', 'argocd.example.lab'],
    ['podinfo', 'podinfo.example.lab'],
    ['grafana', 'grafana.example.lab'],
  ];
  for (const [target, hostname] of ingress) {
    b.link('reverse-proxy', 'traefik', target, {
      hostname,
      targetPortId: b.port(target),
      tls: true,
      auth: target === 'registry' ? 'basic' : 'none',
      pathPrefix: '/',
      websockets: target === 'argocd' || target === 'gitea',
    });
  }

  b.link('backup-to', 'gitea-postgres', 'nas', {
    tool: 'restic',
    schedule: '0 2 * * *',
    retention: '7d 4w 6m',
    targetStorageId: b.storage('nas', 'st_pool'),
    volumeIds: b.serviceNode('gitea-postgres').spec.volumes.map((v) => v.id),
    offsite: false,
  });

  b.note(
    'Assumptions',
    'Public hostnames use example.lab. The load-balancer range is 10.20.0.240-250 and the registry lives in the gitea namespace. Change them in the inspector.',
    { x: 40, y: 700 },
    { width: 460, height: 120 },
  );

  void internet;
  void rack;
  void pipeline;
  void router;
  void sw;
  void w1;
  void w2;
  void cp1;
  return b.finish();
}

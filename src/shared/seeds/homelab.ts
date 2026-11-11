import type { Project } from '../domain/types.ts';
import { SeedBuilder } from './builder.ts';

/**
 * Reference design A: the real homelab, as documented in `infra-architecture/`.
 *
 * Everything that was not stated by the owner is marked `assumed:` in the node notes so it can be
 * corrected in the UI: DHCP range, LXC sizing, the WireGuard overlay, the provider firewall, the
 * proxy network CIDR and the Nextcloud database engine.
 */
export function homelabSeed(): Project {
  const b = new SeedBuilder(
    'hl',
    'Homelab (real)',
    'Proxmox VE at home, a public VPS, and the links between them.',
  );

  const internet = b.subnet({ name: 'Internet', cidr: '0.0.0.0/0', purpose: 'wan', external: true });
  const lan = b.subnet({
    name: 'LAN',
    cidr: '192.168.1.0/24',
    purpose: 'lan',
    gateway: '192.168.1.1',
    dhcp: { start: '192.168.1.100', end: '192.168.1.199' },
  });
  const tailnet = b.subnet({ name: 'Tailnet', cidr: '100.64.0.0/10', purpose: 'vpn-overlay' });
  b.subnet({ name: 'wg-laptop', cidr: '10.8.0.0/24', purpose: 'vpn-overlay', gateway: '10.8.0.1' });

  // ---------------------------------------------------------------- sites
  const home = b.group({
    label: 'Home',
    kind: 'site',
    pos: { x: 30, y: 30 },
    size: { width: 1400, height: 1500 },
    tone: 'neutral',
  });
  const vpsSite = b.group({
    label: 'VPS',
    kind: 'site',
    pos: { x: 1470, y: 30 },
    size: { width: 1000, height: 1150 },
    tone: 'accent',
  });
  const roaming = b.group({
    label: 'Roaming',
    kind: 'site',
    pos: { x: 30, y: 1560 },
    size: { width: 640, height: 260 },
    tone: 'muted',
  });

  // ------------------------------------------------------------- edge/home
  b.device({
    slug: 'internet',
    label: 'Internet',
    pos: { x: 60, y: 80 },
    role: 'internet',
  });
  b.device({
    slug: 'isp-router',
    label: 'ISP router',
    pos: { x: 60, y: 240 },
    role: 'router',
    ip: '192.168.1.1',
    subnetId: lan.id,
    nicName: 'lan0',
    notes: 'Home gateway. WAN address is DHCP from the ISP.',
  });

  const pve = b.device({
    slug: 'proxmox-node',
    label: 'pve',
    pos: { x: 360, y: 180 },
    role: 'hypervisor',
    cpu: 6,
    ramMb: 15360,
    ip: '192.168.1.200',
    subnetId: lan.id,
    nicName: 'vmbr0',
    nicKind: 'bridge',
    storage: [
      { label: 'nvme0', kind: 'nvme', capacityGb: 1000, mountPath: '/' },
      { label: 'media', kind: 'lvm-thin', capacityGb: 500, mountPath: '/srv/media' },
      { label: 'Inventory', kind: 'usb-ssd', capacityGb: 2000, mountPath: '/mnt/inventory', external: true },
    ],
    notes:
      'Dell OptiPlex 3000, i5-12600T (6c/12t), UHD 770 iGPU, 15 GB RAM, Proxmox VE 9. Tailscale subnet router for 192.168.1.0/24.',
  });

  const transcoder = b.device({
    slug: 'gpu-transcoder-box',
    label: 'transcoder',
    pos: { x: 60, y: 420 },
    role: 'transcoder',
    cpu: 6,
    ramMb: 31744,
    ip: '192.168.1.104',
    subnetId: lan.id,
    notes: 'ASUS TUF F15, i5-11400H, 31 GB RAM, RTX 2050 (NVENC HEVC). systemd transcode worker.',
  });

  b.device({
    slug: 'steam-deck',
    label: 'Steam Deck',
    pos: { x: 60, y: 600 },
    role: 'handheld',
    ip: '192.168.1.114',
    subnetId: lan.id,
    nicKind: 'wifi',
  });

  // ------------------------------------------------------------------ LXCs
  const guests: {
    label: string;
    ip: string;
    cpu: number;
    ramMb: number;
    y: number;
    status?: 'running' | 'broken';
    notes?: string;
  }[] = [
    { label: 'ct-100-cloudflared', ip: '192.168.1.201', cpu: 1, ramMb: 256, y: 380 },
    { label: 'ct-101-jellyfin', ip: '192.168.1.202', cpu: 4, ramMb: 4096, y: 440 },
    { label: 'ct-102-qbittorrent', ip: '192.168.1.203', cpu: 2, ramMb: 1024, y: 500 },
    { label: 'ct-103-kavita', ip: '192.168.1.204', cpu: 1, ramMb: 1024, y: 560 },
    { label: 'ct-104-stash', ip: '192.168.1.205', cpu: 2, ramMb: 2048, y: 620 },
    { label: 'ct-105-files', ip: '192.168.1.206', cpu: 1, ramMb: 512, y: 680 },
    {
      label: 'ct-106-immich',
      ip: '192.168.1.207',
      cpu: 4,
      ramMb: 4096,
      y: 740,
      notes: 'Runs a Docker compose stack.',
    },
    { label: 'ct-108-sonarr', ip: '192.168.1.209', cpu: 1, ramMb: 1024, y: 800 },
    { label: 'ct-109-prowlarr', ip: '192.168.1.210', cpu: 1, ramMb: 512, y: 860 },
    {
      label: 'ct-110-flaresolverr',
      ip: '192.168.1.211',
      cpu: 1,
      ramMb: 1024,
      y: 920,
      status: 'broken',
      notes: 'Container runs but nothing listens on 8191: the flaresolverr service is missing inside.',
    },
    { label: 'ct-111-samba', ip: '192.168.1.212', cpu: 1, ramMb: 512, y: 980 },
  ];

  const guestNodes = new Map<string, string>();
  for (const g of guests) {
    const node = b.device({
      slug: 'lxc-container',
      label: g.label,
      pos: { x: 640, y: 180 + guests.indexOf(g) * 92 },
      host: pve.id,
      cpu: g.cpu,
      ramMb: g.ramMb,
      ip: g.ip,
      subnetId: lan.id,
      status: g.status ?? 'running',
      notes: g.notes ?? `assumed: ${g.cpu} vCPU / ${g.ramMb} MB allocation.`,
    });
    guestNodes.set(g.label, node.id);
  }

  b.device({
    slug: 'virtual-machine',
    label: 'vm-112-dev',
    pos: { x: 640, y: 1320 },
    host: pve.id,
    cpu: 4,
    ramMb: 4096,
    ip: null,
    subnetId: lan.id,
    notes: 'Development VM, DHCP address.',
  });

  // ------------------------------------------------------------------- VPS
  const vps = b.device({
    slug: 'vps',
    label: 's.mavubo.com',
    pos: { x: 1520, y: 160 },
    role: 'vps',
    cpu: 4,
    ramMb: 7987,
    ip: '144.91.127.54',
    subnetId: internet.id,
    storage: [{ label: 'sda1', kind: 'nvme', capacityGb: 145, mountPath: '/' }],
    notes:
      'Ubuntu 24.04, 4 vCPU, 7.8 GB RAM, 145 GB disk. Public ports 22, 80, 443, 8443 only. assumed: inbound filtering is provider-level, not ufw.',
  });

  const vpsServices: {
    label: string;
    slug: string;
    x: number;
    y: number;
    ports?: Record<string, { host: number | null }>;
    notes?: string;
    status?: 'running' | 'broken';
  }[] = [
    { label: 'nginx-proxy-manager', slug: 'nginx-proxy-manager', x: 1200, y: 380 },
    { label: 'filebrowser', slug: 'filebrowser', x: 1480, y: 380, ports: { http: { host: 4999 } } },
    {
      label: 'anime-nani',
      slug: 'custom-container',
      x: 1760,
      y: 380,
      ports: { http: { host: 5000 } },
      notes: 'Compose stack in ~/nana-anime, on the proxy-nw network.',
    },
    { label: 'navidrome', slug: 'navidrome', x: 1200, y: 470, ports: { http: { host: 5003 } } },
    { label: 'yamtrack', slug: 'yamtrack', x: 1480, y: 470, ports: { http: { host: 5004 } } },
    { label: 'miniflux', slug: 'miniflux', x: 1760, y: 470, ports: { http: { host: 5005 } } },
    { label: 'grafana', slug: 'grafana', x: 1200, y: 560, ports: { http: { host: 5006 } } },
    { label: 'prometheus', slug: 'prometheus', x: 1480, y: 560 },
    { label: 'node-exporter', slug: 'node-exporter', x: 1760, y: 560 },
    { label: 'cadvisor', slug: 'cadvisor', x: 1200, y: 650 },
    { label: 'homarr', slug: 'homarr', x: 1480, y: 650, ports: { http: { host: 5007 } } },
    { label: 'couchdb', slug: 'couchdb', x: 1760, y: 650, ports: { http: { host: 5984 } } },
    { label: 'audiobookshelf', slug: 'audiobookshelf', x: 1200, y: 740, ports: { http: { host: 13378 } } },
    { label: 'registry', slug: 'docker-registry', x: 1480, y: 740, ports: { registry: { host: 5008 } } },
    { label: 'nextcloud', slug: 'nextcloud', x: 1760, y: 740 },
    { label: 'nextcloud-db', slug: 'mariadb', x: 1200, y: 830, notes: 'assumed: MariaDB 11.' },
    { label: 'nextcloud-redis', slug: 'redis', x: 1480, y: 830 },
    { label: 'nextcloud-cron', slug: 'custom-container', x: 1760, y: 830, notes: 'Nextcloud cron sidecar.' },
    { label: 'glances', slug: 'glances', x: 1200, y: 920 },
    {
      label: 'pve-glances-relay',
      slug: 'custom-container',
      x: 1480,
      y: 920,
      notes: 'Relays pve statistics to Glances.',
    },
    { label: 'tailscale-vps', slug: 'tailscale', x: 1760, y: 920 },
    {
      label: 'crafty',
      slug: 'crafty-controller',
      x: 1200,
      y: 1010,
      ports: { http: { host: 8443 } },
      notes: 'systemd unit, not Docker.',
    },
    { label: 'wireguard', slug: 'wireguard', x: 1480, y: 1010 },
    { label: 'wstunnel', slug: 'wstunnel', x: 1760, y: 1010 },
  ];

  const vpsNodeLabels = new Set<string>();
  for (const s of vpsServices) {
    const node = b.service({
      slug: s.slug,
      label: s.label,
      pos: { x: s.x, y: s.y },
      host: vps.id,
      ports: s.ports,
      status: s.status ?? 'running',
      notes: s.notes ?? '',
    });
    vpsNodeLabels.add(node.label);
  }

  // -------------------------------------------------------------- pve apps
  const pveServices: {
    label: string;
    slug: string;
    guest: string;
    y: number;
    ports?: Record<string, { host: number | null }>;
    notes?: string;
  }[] = [
    { label: 'cloudflared', slug: 'cloudflared', guest: 'ct-100-cloudflared', y: 380 },
    { label: 'jellyfin', slug: 'jellyfin', guest: 'ct-101-jellyfin', y: 440 },
    {
      label: 'qbittorrent',
      slug: 'qbittorrent',
      guest: 'ct-102-qbittorrent',
      y: 500,
      ports: { http: { host: 8080 } },
    },
    { label: 'kavita', slug: 'kavita', guest: 'ct-103-kavita', y: 560 },
    { label: 'stash', slug: 'stash', guest: 'ct-104-stash', y: 620 },
    { label: 'files', slug: 'filebrowser', guest: 'ct-105-files', y: 680, ports: { http: { host: 8080 } } },
    { label: 'immich-server', slug: 'immich', guest: 'ct-106-immich', y: 740 },
    { label: 'immich-postgres', slug: 'postgres', guest: 'ct-106-immich', y: 800 },
    { label: 'immich-redis', slug: 'redis', guest: 'ct-106-immich', y: 860 },
    { label: 'sonarr', slug: 'sonarr', guest: 'ct-108-sonarr', y: 920 },
    { label: 'prowlarr', slug: 'prowlarr', guest: 'ct-109-prowlarr', y: 980 },
    { label: 'flaresolverr', slug: 'flaresolverr', guest: 'ct-110-flaresolverr', y: 1040 },
    { label: 'samba', slug: 'samba', guest: 'ct-111-samba', y: 1100 },
    {
      label: 'tailscale',
      slug: 'tailscale',
      guest: 'pve',
      y: 1160,
      notes: 'Tailscale on the host, advertising 192.168.1.0/24.',
    },
    {
      label: 'proxmox-ve-ui',
      slug: 'proxmox-ve-ui',
      guest: 'pve',
      y: 1220,
      notes: 'Proxmox web UI on 8006.',
    },
    {
      label: 'transcode-worker',
      slug: 'custom-systemd',
      guest: 'transcoder',
      y: 380,
      notes: 'Inbox → HEVC 10-bit NVENC → rsync to Inventory.',
    },
    {
      label: 'library-transcode',
      slug: 'custom-systemd',
      guest: 'transcoder',
      y: 440,
      notes: 'In-place re-encode of library files, originals kept.',
    },
  ];

  for (const s of pveServices) {
    const host =
      s.guest === 'pve' ? pve.id : s.guest === 'transcoder' ? transcoder.id : guestNodes.get(s.guest);
    if (!host) continue;
    b.service({
      slug: s.slug,
      label: s.label,
      pos: {
        x: 900 + (pveServices.indexOf(s) % 2) * 240,
        y: 130 + Math.floor(pveServices.indexOf(s) / 2) * 96,
      },
      host,
      ports: s.ports,
      notes: s.notes ?? '',
    });
  }

  // ---------------------------------------------------------------- clients
  const laptop = b.device({
    slug: 'laptop',
    label: 'laptop',
    pos: { x: 70, y: 1620 },
    role: 'laptop',
    ip: null,
    nicKind: 'wifi',
    notes: 'WireGuard over wstunnel to the VPS: the FortiGate network blocks UDP.',
  });
  const phone = b.device({
    slug: 'phone',
    label: 'galaxy-a16',
    pos: { x: 380, y: 1620 },
    role: 'phone',
    ip: null,
    nicKind: 'cellular',
  });

  // ------------------------------------------------------------------ links
  b.link('ethernet', 'ISP router', 'pve', { speedMbps: 1000, cable: 'cat6' });
  b.link('ethernet', 'ISP router', 'transcoder', { speedMbps: 1000, cable: 'cat6' });
  b.link('wifi', 'Steam Deck', 'ISP router', { band: '5', ssid: 'home' });
  b.link('vpn-tunnel', 'pve', 's.mavubo.com', {
    protocol: 'tailscale',
    transport: 'derp',
    overlaySubnetId: tailnet.id,
    routedCidrs: ['192.168.1.0/24'],
  });
  b.link('vpn-tunnel', 'laptop', 's.mavubo.com', {
    protocol: 'wireguard',
    transport: 'wstunnel',
    endpointHost: 's.mavubo.com',
    endpointPort: 51820,
    routedCidrs: ['192.168.1.0/24'],
    fullTunnel: true,
  });
  b.link('vpn-tunnel', 'galaxy-a16', 's.mavubo.com', {
    protocol: 'tailscale',
    transport: 'derp',
    overlaySubnetId: tailnet.id,
  });

  b.addPort('anime-nani', 'http', 5000, 5000);

  // Public hostnames through Cloudflare (home) and NPM (VPS).
  b.link('reverse-proxy', 'cloudflared', 'proxmox-ve-ui', {
    hostname: 'pve.lumosdhia.com',
    targetPortId: b.port('proxmox-ve-ui'),
    tls: true,
    auth: 'cloudflare-access',
    pathPrefix: '/',
    websockets: true,
  });

  const proxied: [string, string, string, 'none' | 'basic' | 'sso'][] = [
    ['nginx-proxy-manager', 'filebrowser', 'filebrowser.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'anime-nani', 'nani.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'navidrome', 'navidrome.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'yamtrack', 'yamtrack.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'miniflux', 'miniflux.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'grafana', 'grafana.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'homarr', 'homarr.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'audiobookshelf', 'audiobookshelf.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'nextcloud', 'nextcloud.purplehallos.com', 'none'],
    ['nginx-proxy-manager', 'registry', 'docker.lumosdhia.com', 'basic'],
    ['nginx-proxy-manager', 'couchdb', 'obsidian.purplehallos.com', 'none'],
  ];
  for (const [proxy, target, hostname, auth] of proxied) {
    b.link('reverse-proxy', proxy, target, {
      hostname,
      targetPortId: b.port(target),
      tls: true,
      auth,
      pathPrefix: '/',
      websockets: target === 'nextcloud' || target === 'couchdb',
    });
  }

  const depends: [
    string,
    string,
    'service' | 'database' | 'cache' | 'network' | 'storage' | 'ci' | 'auth' | 'power',
  ][] = [
    ['immich-server', 'immich-postgres', 'database'],
    ['immich-server', 'immich-redis', 'cache'],
    ['sonarr', 'prowlarr', 'service'],
    ['sonarr', 'qbittorrent', 'service'],
    ['prowlarr', 'flaresolverr', 'service'],
    ['grafana', 'prometheus', 'service'],
    ['prometheus', 'node-exporter', 'service'],
    ['prometheus', 'cadvisor', 'service'],
    ['yamtrack', 'nextcloud-redis', 'cache'],
    ['nextcloud', 'nextcloud-db', 'database'],
    ['nextcloud', 'nextcloud-redis', 'cache'],
    ['nextcloud-cron', 'nextcloud', 'service'],
    ['pve-glances-relay', 'pve', 'service'],
    ['jellyfin', 'pve', 'storage'],
    ['qbittorrent', 'pve', 'storage'],
    ['kavita', 'pve', 'storage'],
  ];
  for (const [from, to, reason] of depends) b.link('depends-on', from, to, { reason, hard: true });

  b.link('replicates-to', 'library-transcode', 'pve', {
    method: 'rsync',
    schedule: '0 3 * * *',
    targetStorageId: b.storage('pve', 'Inventory'),
  });

  b.note(
    'How this was drawn',
    'Facts come from infra-architecture/. Items marked "assumed:" are guesses: DHCP range, LXC sizing, WireGuard overlay, the provider firewall, the proxy network CIDR, MariaDB for Nextcloud and the purplehallos subdomains. Edit them in the inspector.',
    { x: 30, y: 1850 },
    { width: 520, height: 150 },
  );

  // Keep the group membership explicit for layout; groups are not parents in v1.
  for (const node of b.project.nodes) {
    if (node.kind === 'group' || node.kind === 'note') continue;
    // Hosted nodes must not also carry a group, per the schema.
    if (node.kind === 'device' && node.placement.kind === 'guest') continue;
    if (node.kind === 'service' && node.placement.kind !== 'standalone') continue;
    if (node.position.x < 1150) node.groupId = node.position.y > 980 ? roaming.id : home.id;
    else node.groupId = vpsSite.id;
  }

  void internet;
  void laptop;
  void phone;
  void vpsNodeLabels;
  return b.finish();
}

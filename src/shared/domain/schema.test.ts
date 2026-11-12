import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { ProjectSchema } from './schema.ts';
import type { Project } from './types.ts';

const root = join(dirname(fileURLToPath(import.meta.url)), '../../../');
const minimalPath = join(root, 'tests/fixtures/documents/v1/minimal.json');

function minimal(): Project {
  return JSON.parse(readFileSync(minimalPath, 'utf8')) as Project;
}

describe('ProjectSchema', () => {
  it('minimal fixture parses', () => {
    const parsed = ProjectSchema.safeParse(minimal());
    expect(parsed.success).toBe(true);
  });

  it('rejects unknown key at nodes[0].spec.foo', () => {
    const p = minimal() as unknown as Record<string, unknown>;
    const nodes = p.nodes as Record<string, unknown>[];
    const spec = { ...(nodes[0] as { spec: Record<string, unknown> }).spec, foo: 1 };
    (nodes[0] as { spec: unknown }).spec = spec;
    const parsed = ProjectSchema.safeParse(p);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const paths = parsed.error.issues.map((i) => i.path.map(String).join('.'));
    expect(paths.some((x) => x.includes('nodes.0.spec'))).toBe(true);
  });

  it('rejects link to missing node with path links[0].target', () => {
    const p = minimal();
    p.links.push({
      id: 'l_missing01',
      kind: 'ethernet',
      source: 'n_mini00001',
      target: 'n_ghost0001',
      sourceHandle: null,
      targetHandle: null,
      label: '',
      attrs: {
        sourceNicId: null,
        targetNicId: null,
        speedMbps: null,
        poe: false,
        cable: null,
        vlanMode: 'access',
        vlans: [],
      },
    });
    const parsed = ProjectSchema.safeParse(p);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    const issue = parsed.error.issues.find((i) => i.path.join('.') === 'links.0.target');
    expect(issue).toBeTruthy();
  });

  it('rejects service placed on a note', () => {
    const p = minimal();
    p.nodes.push({
      id: 'n_note00001',
      kind: 'note',
      label: 'Note',
      position: { x: 0, y: 0 },
      size: { width: 160, height: 120 },
      groupId: null,
      status: 'planned',
      notes: '',
      tags: [],
      locked: false,
      text: 'hi',
    });
    p.nodes.push({
      id: 'n_svc000001',
      kind: 'service',
      label: 'Jellyfin',
      position: { x: 10, y: 10 },
      size: null,
      groupId: null,
      status: 'planned',
      notes: '',
      tags: [],
      locked: false,
      catalogSlug: 'jellyfin',
      placement: { kind: 'host', hostId: 'n_note00001' },
      spec: {
        runtime: 'docker',
        image: 'jellyfin/jellyfin:10.10.3',
        containerName: null,
        command: null,
        category: 'media',
        officialUrl: 'https://jellyfin.org',
        iconSlug: 'jellyfin',
        ports: [],
        env: [],
        volumes: [],
        networks: [],
        healthcheck: null,
        resources: { cpuMillicores: 100, ramMb: 128, ramLimitMb: null, gpu: 'none', gpuApis: [] },
        restart: 'unless-stopped',
        user: null,
        labels: {},
        capabilities: [],
        adminUi: false,
      },
    });
    const parsed = ProjectSchema.safeParse(p);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((i) => i.message.includes('non-device'))).toBe(true);
  });

  it('rejects guest on non-hypervisor', () => {
    const p = minimal();
    p.nodes.push({
      id: 'n_lxc000001',
      kind: 'device',
      label: 'CT 101',
      position: { x: 80, y: 80 },
      size: null,
      groupId: null,
      status: 'planned',
      notes: '',
      tags: [],
      locked: false,
      catalogSlug: 'lxc-container',
      expanded: false,
      placement: { kind: 'guest', hostId: 'n_mini00001', guestType: 'lxc', guestId: 101 },
      spec: {
        ...p.nodes[0]!.spec,
        role: 'server',
        formFactor: 'virtual',
        hostname: 'ct101',
        nics: [],
      },
    });
    const parsed = ProjectSchema.safeParse(p);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((i) => i.message.includes('non-hypervisor'))).toBe(true);
  });

  it('rejects two network nodes for one subnet', () => {
    const p = minimal();
    p.subnets.push({
      id: 's_lan000001',
      name: 'LAN',
      cidr: '192.168.1.0/24',
      vlan: null,
      gateway: '192.168.1.1',
      dhcpRange: null,
      dns: [],
      purpose: 'lan',
      scope: { kind: 'global' },
      external: false,
      siteGroupId: null,
    });
    const net = (id: string) => ({
      id,
      kind: 'network' as const,
      label: 'LAN',
      position: { x: 0, y: 0 },
      size: { width: 480, height: 32 },
      groupId: null,
      status: 'running' as const,
      notes: '',
      tags: [],
      locked: false,
      subnetId: 's_lan000001',
      orientation: 'horizontal' as const,
    });
    p.nodes.push(net('n_net000001'), net('n_net000002'));
    const parsed = ProjectSchema.safeParse(p);
    expect(parsed.success).toBe(false);
    if (parsed.success) return;
    expect(parsed.error.issues.some((i) => i.message.includes('two network nodes'))).toBe(true);
  });
});

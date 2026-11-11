import type { Project } from '../domain/types.ts';
import { homelabSeed } from './homelab.ts';
import { k3sCicdSeed } from './k3s-cicd.ts';

export type SeedId = 'homelab' | 'k3s-cicd';

export type SeedBuilder = () => Project;

export interface SeedMeta {
  id: SeedId;
  name: string;
  description: string;
  build: SeedBuilder;
}

export const SEEDS: SeedMeta[] = [
  {
    id: 'homelab',
    name: 'Homelab (real)',
    description:
      'Proxmox VE host with its LXCs and services, a public VPS with Docker, and the VPN links between them.',
    build: homelabSeed,
  },
  {
    id: 'k3s-cicd',
    name: 'k3s cluster + CI/CD',
    description:
      'Three-node k3s behind a firewall, Gitea and act-runner building images, Argo CD syncing the app.',
    build: k3sCicdSeed,
  },
];

export function getSeed(id: SeedId): SeedBuilder | null {
  return SEEDS.find((s) => s.id === id)?.build ?? null;
}

export function listSeeds(): { id: SeedId; build: SeedBuilder }[] {
  return SEEDS.map(({ id, build }) => ({ id, build }));
}

export const SEED_HOMELAB: SeedBuilder = homelabSeed;
export const SEED_K3S_CICD: SeedBuilder = k3sCicdSeed;

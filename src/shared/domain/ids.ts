import { nanoid } from 'nanoid';

export type IdGenerator = () => string;

let generator: IdGenerator = () => nanoid(10);

export function setIdGenerator(next: IdGenerator): void {
  generator = next;
}

export function resetIdGenerator(): void {
  generator = () => nanoid(10);
}

export function sequentialIds(start = 1): IdGenerator {
  let n = start;
  return () => String(n++).padStart(10, '0');
}

export function seedIds(seed: string): IdGenerator {
  let n = 1;
  const prefix = seed
    .replace(/[^a-z0-9]/gi, '')
    .slice(0, 2)
    .padEnd(2, 'x');
  return () => `${prefix}${String(n++).padStart(8, '0')}`;
}

export function newId(prefix: string): string {
  return `${prefix}${generator()}`;
}

export const ID_PREFIX = {
  project: 'proj_',
  node: 'n_',
  link: 'l_',
  subnet: 's_',
  nic: 'i_',
  storage: 'd_',
  gpu: 'g_',
  port: 'p_',
  volume: 'v_',
  env: 'e_',
  cluster: 'k_',
  zone: 'z_',
  forward: 'f_',
} as const;

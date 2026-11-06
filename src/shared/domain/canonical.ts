import type { Project } from './types.ts';

export function sortKeysDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortKeysDeep);
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(obj).sort()) {
      out[key] = sortKeysDeep(obj[key]);
    }
    return out;
  }
  return value;
}

export function hashableView(project: Project): unknown {
  const { viewport: _viewport, ...rest } = project;
  return sortKeysDeep(rest);
}

export function canonicalJson(project: Project): string {
  return JSON.stringify(sortKeysDeep(project));
}

export function canonicalHashSource(project: Project): string {
  return JSON.stringify(hashableView(project));
}

export async function sha256Hex(text: string): Promise<string> {
  const bytes = new TextEncoder().encode(text);
  const subtle = globalThis.crypto.subtle;
  const buf = await subtle.digest('SHA-256', bytes);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

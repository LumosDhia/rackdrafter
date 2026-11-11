import { clock } from '#shared/domain/clock.ts';
import type { Project } from '#shared/domain/types.ts';

const key = (id: string) => `ds:doc:${id}`;

export interface LocalMirror {
  document: Project;
  baseSeq: number;
  savedAt: number;
  dirty: boolean;
}

export function writeMirror(id: string, mirror: LocalMirror): void {
  try {
    localStorage.setItem(key(id), JSON.stringify(mirror));
    localStorage.setItem('ds:last-project', id);
  } catch {
    evictAndRetry(id, mirror);
  }
}

function evictAndRetry(id: string, mirror: LocalMirror): void {
  const entries: { k: string; savedAt: number }[] = [];
  for (let i = 0; i < localStorage.length; i++) {
    const k = localStorage.key(i);
    if (!k || !k.startsWith('ds:doc:') || k === key(id)) continue;
    try {
      const v = JSON.parse(localStorage.getItem(k) ?? '') as LocalMirror;
      entries.push({ k, savedAt: v.savedAt });
    } catch {
      localStorage.removeItem(k!);
    }
  }
  entries.sort((a, b) => a.savedAt - b.savedAt);
  if (entries[0]) localStorage.removeItem(entries[0].k);
  try {
    localStorage.setItem(key(id), JSON.stringify(mirror));
  } catch {
    /* give up */
  }
}

export function readMirror(id: string): LocalMirror | null {
  try {
    const raw = localStorage.getItem(key(id));
    if (!raw) return null;
    return JSON.parse(raw) as LocalMirror;
  } catch {
    return null;
  }
}

export function nowMirror(document: Project, baseSeq: number, dirty: boolean): LocalMirror {
  return { document, baseSeq, savedAt: clock.now(), dirty };
}

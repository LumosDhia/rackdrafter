import { useAppStore } from '../store/index.ts';
import { HttpRepository } from './httpRepository.ts';
import { IdbRepository } from './idbRepository.ts';
import { nowMirror, writeMirror } from './local.ts';
import { api } from '../api/client.ts';

const http = new HttpRepository();
const idb = new IdbRepository();

let timer: ReturnType<typeof setTimeout> | null = null;
let firstDirtyAt: number | null = null;
let inFlight = false;
let queued = false;
let backoff = 2000;
let mirrorTimer: ReturnType<typeof setTimeout> | null = null;
let unsub: (() => void) | null = null;

function schedule(ms: number): void {
  if (timer) clearTimeout(timer);
  timer = setTimeout(() => {
    void flush();
  }, ms);
}

async function flush(): Promise<void> {
  const state = useAppStore.getState();
  if (state.saveState !== 'dirty' && !queued) return;
  if (inFlight) {
    queued = true;
    return;
  }
  const id = state.projectId ?? state.project.id;
  inFlight = true;
  queued = false;
  firstDirtyAt = null;
  useAppStore.getState().setSaveState('saving');
  try {
    const result = await http.save(id, state.docSeq, state.project);
    if ('conflict' in result && result.conflict) {
      useAppStore.getState().setSaveState('conflict');
      return;
    }
    useAppStore.getState().setDocSeq(result.meta.docSeq);
    useAppStore.getState().setSaveState('saved');
    useAppStore.getState().setOffline(false);
    backoff = 2000;
    try {
      writeMirror(id, nowMirror(state.project, result.meta.docSeq, false));
      await idb.save(id, result.meta.docSeq, state.project);
    } catch {
      // The server copy is authoritative; a browser-storage failure must not
      // make the app claim it is offline.
    }
  } catch {
    useAppStore.getState().setSaveState('offline');
    useAppStore.getState().setOffline(true);
    writeMirror(id, nowMirror(state.project, state.docSeq, true));
    schedule(backoff);
    backoff = Math.min(backoff * 2, 30_000);
    void pollHealth();
  } finally {
    inFlight = false;
    if (queued) schedule(0);
  }
}

async function pollHealth(): Promise<void> {
  try {
    await api.health();
    backoff = 2000;
    if (useAppStore.getState().saveState === 'offline') {
      useAppStore.getState().setSaveState('dirty');
      schedule(0);
    }
  } catch {
    /* still offline */
  }
}

export function startAutosave(): void {
  if (unsub) return;
  unsub = useAppStore.subscribe((s, prev) => {
    if (s.project === prev.project) return;
    const id = s.projectId ?? s.project.id;
    if (!mirrorTimer) {
      mirrorTimer = setTimeout(() => {
        mirrorTimer = null;
        const cur = useAppStore.getState();
        writeMirror(id, nowMirror(cur.project, cur.docSeq, cur.saveState !== 'saved'));
      }, 1000);
    }
    if (s.saveState === 'dirty' || s.project !== prev.project) {
      if (s.saveState !== 'dirty') useAppStore.setState({ saveState: 'dirty' });
      if (firstDirtyAt === null) firstDirtyAt = performance.now();
      const wait = firstDirtyAt !== null ? Math.max(0, 5000 - (performance.now() - firstDirtyAt)) : 800;
      schedule(Math.min(800, wait));
    }
  });
  window.addEventListener('beforeunload', onBeforeUnload);
}

function onBeforeUnload(e: BeforeUnloadEvent): void {
  const s = useAppStore.getState().saveState;
  if (s === 'dirty' || s === 'saving' || s === 'offline') {
    e.preventDefault();
    e.returnValue = '';
  }
}

export function stopAutosave(): void {
  unsub?.();
  unsub = null;
  window.removeEventListener('beforeunload', onBeforeUnload);
}

export async function flushNow(): Promise<void> {
  await flush();
}

export { http, idb };

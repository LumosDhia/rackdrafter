import { applyPatches, enablePatches, produce, produceWithPatches, type Patch } from 'immer';
import { create } from 'zustand';
import { emptyProject } from '#shared/domain/defaults.ts';
import { clock } from '#shared/domain/clock.ts';
import type { LinkId, LinkKind, NodeId, Project } from '#shared/domain/types.ts';
import type { Command } from './commands.ts';

enablePatches();

export interface Selection {
  nodeIds: NodeId[];
  linkIds: LinkId[];
}

export interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey: string | null;
  at: number;
  selectionBefore: Selection;
  selectionAfter: Selection;
}

export type SaveState = 'saved' | 'saving' | 'error' | 'offline' | 'conflict' | 'dirty';
export type Tool = 'select' | 'pan';

export interface EditorState {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: Selection;
  tool: Tool;
  linkKind: LinkKind | 'auto';
  placing: string | null;
  panels: { palette: boolean; inspector: boolean; drawer: boolean; minimap: boolean };
  theme: 'light' | 'dark' | 'system';
  saveState: SaveState;
  docSeq: number;
  projectId: string | null;
  offline: boolean;
  loadProject: (p: Project, meta?: { docSeq: number; id: string }) => void;
  dispatch: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  transact: (label: string, fn: (d: Project) => void) => void;
  applySilently: (fn: (d: Project) => void) => void;
  recordManual: (label: string, patches: Patch[], inverse: Patch[]) => void;
  setSelection: (s: Selection) => void;
  setTool: (t: Tool) => void;
  setLinkKind: (k: LinkKind | 'auto') => void;
  setPlacing: (slug: string | null) => void;
  togglePanel: (key: keyof EditorState['panels']) => void;
  setTheme: (t: EditorState['theme']) => void;
  setSaveState: (s: SaveState) => void;
  setDocSeq: (n: number) => void;
  setOffline: (v: boolean) => void;
}

const emptySelection = (): Selection => ({ nodeIds: [], linkIds: [] });
const HISTORY_CAP = 200;

function applyTheme(theme: EditorState['theme']): void {
  if (typeof document === 'undefined') return;
  const prefersDark =
    typeof window !== 'undefined' &&
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(prefers-color-scheme: dark)').matches;
  const dark = theme === 'dark' || (theme === 'system' && prefersDark);
  document.documentElement.classList.toggle('dark', dark);
  try {
    localStorage.setItem('ds:theme', theme);
  } catch {
    /* quota */
  }
}

function readTheme(): EditorState['theme'] {
  if (typeof localStorage === 'undefined') return 'system';
  try {
    const t = localStorage.getItem('ds:theme');
    if (t === 'light' || t === 'dark' || t === 'system') return t;
  } catch {
    /* */
  }
  return 'system';
}

export const useAppStore = create<EditorState>((set, get) => ({
  project: emptyProject('Untitled'),
  past: [],
  future: [],
  selection: emptySelection(),
  tool: 'select',
  linkKind: 'auto',
  placing: null,
  panels: { palette: true, inspector: true, drawer: true, minimap: true },
  theme: readTheme(),
  saveState: 'saved',
  docSeq: 0,
  projectId: null,
  offline: false,

  loadProject: (p, meta) => {
    set({
      project: p,
      past: [],
      future: [],
      selection: emptySelection(),
      saveState: 'saved',
      docSeq: meta?.docSeq ?? 0,
      projectId: meta?.id ?? p.id,
    });
  },

  dispatch: (cmd) => {
    const state = get();
    const selectionBefore = state.selection;
    const [next, patches, inverse] = produceWithPatches(state.project, (draft) => {
      cmd.run(draft);
    });
    if (patches.length === 0) return;
    const at = clock.now();
    const selectionAfter = selectionBefore;
    const top = state.past.at(-1);
    let past: HistoryEntry[];
    if (cmd.coalesceKey && top?.coalesceKey === cmd.coalesceKey && at - top.at < 1000) {
      past = state.past.slice(0, -1);
      past.push({
        ...top,
        patches: [...top.patches, ...patches],
        inverse: [...inverse, ...top.inverse],
        at,
        selectionAfter,
      });
    } else {
      past = [
        ...state.past,
        {
          label: cmd.label,
          patches,
          inverse,
          coalesceKey: cmd.coalesceKey ?? null,
          at,
          selectionBefore,
          selectionAfter,
        },
      ];
    }
    if (past.length > HISTORY_CAP) past = past.slice(past.length - HISTORY_CAP);
    set({ project: next, past, future: [], saveState: 'dirty' });
  },

  undo: () => {
    const { past, project, future, selection } = get();
    const entry = past.at(-1);
    if (!entry) return;
    const next = applyPatches(project, entry.inverse);
    set({
      project: next,
      past: past.slice(0, -1),
      future: [...future, entry],
      selection: entry.selectionBefore,
      saveState: 'dirty',
    });
    void selection;
  },

  redo: () => {
    const { future, project, past } = get();
    const entry = future.at(-1);
    if (!entry) return;
    const next = applyPatches(project, entry.patches);
    set({
      project: next,
      future: future.slice(0, -1),
      past: [...past, entry],
      selection: entry.selectionAfter,
      saveState: 'dirty',
    });
  },

  transact: (label, fn) => {
    get().dispatch({ type: 'transact', label, run: (d) => fn(d as Project) });
  },

  applySilently: (fn) => {
    const next = produce(get().project, (d) => {
      fn(d as Project);
    });
    set({ project: next });
  },

  recordManual: (label, patches, inverse) => {
    if (patches.length === 0) return;
    const { past, selection, project } = get();
    const nextPast = [
      ...past,
      {
        label,
        patches,
        inverse,
        coalesceKey: null,
        at: clock.now(),
        selectionBefore: selection,
        selectionAfter: selection,
      },
    ];
    set({
      past: nextPast.length > HISTORY_CAP ? nextPast.slice(nextPast.length - HISTORY_CAP) : nextPast,
      future: [],
      saveState: 'dirty',
      project,
    });
  },

  setSelection: (s) => set({ selection: s }),
  setTool: (t) => set({ tool: t }),
  setLinkKind: (k) => set({ linkKind: k }),
  setPlacing: (slug) => set({ placing: slug }),
  togglePanel: (key) => set((s) => ({ panels: { ...s.panels, [key]: !s.panels[key] } })),
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
  setSaveState: (s) => set({ saveState: s }),
  setDocSeq: (n) => set({ docSeq: n }),
  setOffline: (v) => set({ offline: v }),
}));

applyTheme(useAppStore.getState().theme);

import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { create } from 'zustand';
import { emptyProject } from '#shared/domain/defaults.ts';
import type { LinkId, LinkKind, NodeId, Project } from '#shared/domain/types.ts';

enablePatches();

export interface Command {
  label: string;
  coalesceKey?: string;
  run: (draft: Project) => void;
}

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
}

export type SaveState = 'saved' | 'saving' | 'error' | 'offline' | 'dirty';

interface State {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selection: Selection;
  tool: 'select' | 'pan';
  linkKind: LinkKind | 'auto';
  panels: { palette: boolean; inspector: boolean; drawer: boolean; minimap: boolean };
  theme: 'light' | 'dark' | 'system';
  saveState: SaveState;
  docSeq: number;
  projectId: string | null;
  loadProject: (p: Project, meta?: { docSeq: number; id: string }) => void;
  dispatch: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  setSelection: (s: Selection) => void;
  setTool: (t: 'select' | 'pan') => void;
  setLinkKind: (k: LinkKind | 'auto') => void;
  togglePanel: (key: keyof State['panels']) => void;
  setTheme: (t: State['theme']) => void;
  setSaveState: (s: SaveState) => void;
  setDocSeq: (n: number) => void;
}

const empty = (): Selection => ({ nodeIds: [], linkIds: [] });

function applyTheme(theme: State['theme']) {
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.classList.toggle('dark', dark);
  localStorage.setItem('ds:theme', theme);
}

export const useAppStore = create<State>((set, get) => ({
  project: emptyProject('Untitled'),
  past: [],
  future: [],
  selection: empty(),
  tool: 'select',
  linkKind: 'auto',
  panels: { palette: true, inspector: true, drawer: true, minimap: true },
  theme: (localStorage.getItem('ds:theme') as State['theme']) ?? 'system',
  saveState: 'saved',
  docSeq: 0,
  projectId: null,

  loadProject: (p, meta) => {
    set({
      project: p,
      past: [],
      future: [],
      selection: empty(),
      saveState: 'saved',
      docSeq: meta?.docSeq ?? 0,
      projectId: meta?.id ?? p.id,
    });
  },

  dispatch: (cmd) => {
    const state = get();
    const [next, patches, inverse] = produceWithPatches(state.project, (draft) => {
      cmd.run(draft as Project);
    });
    if (patches.length === 0) return;
    const at = Date.now();
    const top = state.past[state.past.length - 1];
    let past: HistoryEntry[];
    if (cmd.coalesceKey && top && top.coalesceKey === cmd.coalesceKey && at - top.at < 1000) {
      past = [
        ...state.past.slice(0, -1),
        { ...top, patches: [...top.patches, ...patches], inverse: [...inverse, ...top.inverse], at },
      ];
    } else {
      past = [
        ...state.past,
        {
          label: cmd.label,
          patches,
          inverse,
          coalesceKey: cmd.coalesceKey ?? null,
          at,
          selectionBefore: state.selection,
        },
      ];
    }
    set({ project: next, past, future: [], saveState: 'dirty' });
  },

  undo: () => {
    const { past, project, future } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      project: applyPatches(project, entry.inverse),
      past: past.slice(0, -1),
      future: [...future, entry],
      selection: entry.selectionBefore,
      saveState: 'dirty',
    });
  },

  redo: () => {
    const { future, project, past } = get();
    const entry = future[future.length - 1];
    if (!entry) return;
    set({
      project: applyPatches(project, entry.patches),
      future: future.slice(0, -1),
      past: [...past, entry],
      saveState: 'dirty',
    });
  },

  setSelection: (s) => set({ selection: s }),
  setTool: (t) => set({ tool: t }),
  setLinkKind: (k) => set({ linkKind: k }),
  togglePanel: (key) => set((s) => ({ panels: { ...s.panels, [key]: !s.panels[key] } })),
  setTheme: (t) => {
    applyTheme(t);
    set({ theme: t });
  },
  setSaveState: (s) => set({ saveState: s }),
  setDocSeq: (n) => set({ docSeq: n }),
}));

applyTheme(useAppStore.getState().theme);

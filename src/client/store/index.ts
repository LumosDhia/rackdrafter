import { applyPatches, enablePatches, produceWithPatches, type Patch } from 'immer';
import { create } from 'zustand';
import { emptyProject } from '#shared/domain/defaults.ts';
import type { NodeId, Project } from '#shared/domain/types.ts';

// immer patches are the whole undo story, no snapshots of the project
enablePatches();

export interface Command {
  label: string;
  // dragging fires this on every frame, same key within a second = one undo step
  coalesceKey?: string;
  run: (draft: Project) => void;
}

interface HistoryEntry {
  label: string;
  patches: Patch[];
  inverse: Patch[];
  coalesceKey: string | null;
  at: number;
}

interface State {
  project: Project;
  past: HistoryEntry[];
  future: HistoryEntry[];
  selected: NodeId[];
  dispatch: (cmd: Command) => void;
  undo: () => void;
  redo: () => void;
  select: (ids: NodeId[]) => void;
}

export const useAppStore = create<State>((set, get) => ({
  project: emptyProject('Untitled'),
  past: [],
  future: [],
  selected: [],

  dispatch: (cmd) => {
    const [next, patches, inverse] = produceWithPatches(get().project, (draft) => {
      cmd.run(draft as Project);
    });
    if (patches.length === 0) return;
    const at = Date.now();
    set((s) => {
      const top = s.past[s.past.length - 1];
      if (cmd.coalesceKey && top && top.coalesceKey === cmd.coalesceKey && at - top.at < 1000) {
        // inverse has to run newest first, so the new inverse goes in front
        const merged = {
          ...top,
          patches: [...top.patches, ...patches],
          inverse: [...inverse, ...top.inverse],
          at,
        };
        return { project: next, past: [...s.past.slice(0, -1), merged], future: [] };
      }
      return {
        project: next,
        past: [
          ...s.past,
          { label: cmd.label, patches, inverse, coalesceKey: cmd.coalesceKey ?? null, at },
        ],
        future: [],
      };
    });
  },

  undo: () => {
    const { past, project, future } = get();
    const entry = past[past.length - 1];
    if (!entry) return;
    set({
      project: applyPatches(project, entry.inverse),
      past: past.slice(0, -1),
      future: [...future, entry],
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
    });
  },

  select: (ids) => set({ selected: ids }),
}));

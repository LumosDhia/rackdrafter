import { create } from 'zustand';
import { emptyProject } from '#shared/domain/defaults.ts';
import type { Project } from '#shared/domain/types.ts';

// TODO real nodes come from the catalog, hardcoded so the canvas has something to show
const seedNodes: any[] = [
  { id: 'n1', kind: 'device', label: 'proxmox', position: { x: 40, y: 40 } },
  { id: 'n2', kind: 'service', label: 'jellyfin', position: { x: 300, y: 60 } },
  { id: 'n3', kind: 'service', label: 'pihole', position: { x: 300, y: 180 } },
];

interface State {
  project: Project;
  selected: string | null;
  addNode: (node: any) => void;
  moveNode: (id: string, x: number, y: number) => void;
  removeNode: (id: string) => void;
  select: (id: string | null) => void;
}

export const useAppStore = create<State>((set, get) => ({
  project: { ...emptyProject('Untitled'), nodes: seedNodes } as Project,
  selected: null,

  addNode: (node) => {
    const p = get().project;
    // mutating on purpose for now, zustand just needs a new top level object
    p.nodes.push(node);
    console.log('addNode', node.id, p.nodes.length);
    set({ project: { ...p } });
  },

  moveNode: (id, x, y) => {
    const p = get().project;
    const n = p.nodes.find((n) => n.id === id);
    if (n) {
      n.position.x = x;
      n.position.y = y;
    }
    set({ project: { ...p } });
  },

  removeNode: (id) => {
    const p = get().project;
    p.nodes = p.nodes.filter((n) => n.id !== id);
    set({ project: { ...p }, selected: null });
  },

  select: (id) => set({ selected: id }),
}));

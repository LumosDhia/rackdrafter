import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { produceWithPatches } from 'immer';
import { clock } from '#shared/domain/clock.ts';
import { emptyProject } from '#shared/domain/defaults.ts';
import { resetIdGenerator, sequentialIds, setIdGenerator } from '#shared/domain/ids.ts';
import { addNodeFromCatalog, renameNode } from './commands.ts';
import { useAppStore } from './index.ts';

function resetStore(): void {
  useAppStore.getState().loadProject(emptyProject('t'));
}

describe('history', () => {
  beforeEach(() => {
    setIdGenerator(sequentialIds(1));
    clock.setNow(() => 1_000_000);
    resetStore();
  });
  afterEach(() => {
    resetIdGenerator();
    clock.reset();
  });

  it('dispatch then undo restores previous project by reference equality of untouched nodes', () => {
    useAppStore.getState().dispatch(addNodeFromCatalog('mini-pc', { x: 0, y: 0 }));
    useAppStore.getState().dispatch(addNodeFromCatalog('router', { x: 40, y: 0 }));
    const nodes = useAppStore.getState().project.nodes;
    expect(nodes).toHaveLength(2);
    const first = nodes[0];
    useAppStore.getState().dispatch(renameNode(nodes[1]!.id, 'gw'));
    expect(useAppStore.getState().project.nodes[0]).toBe(first);
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.nodes[0]).toBe(first);
    expect(useAppStore.getState().project.nodes[1]?.label).toBe('Router');
  });

  it('typing coalesces into one entry within 1000 ms', () => {
    useAppStore.getState().dispatch(addNodeFromCatalog('mini-pc', { x: 0, y: 0 }));
    const id = useAppStore.getState().project.nodes[0]!.id;
    let t = 2_000_000;
    clock.setNow(() => t);
    useAppStore.getState().dispatch(renameNode(id, 'a'));
    t += 200;
    useAppStore.getState().dispatch(renameNode(id, 'ab'));
    t += 200;
    useAppStore.getState().dispatch(renameNode(id, 'abc'));
    const past = useAppStore.getState().past;
    expect(past.filter((e) => e.coalesceKey === `edit:${id}:label`)).toHaveLength(1);
    expect(useAppStore.getState().project.nodes[0]?.label).toBe('abc');
  });

  it('drag records one entry with from/to positions', () => {
    useAppStore.getState().dispatch(addNodeFromCatalog('mini-pc', { x: 0, y: 0 }));
    const id = useAppStore.getState().project.nodes[0]!.id;
    const from = { x: 0, y: 0 };
    const to = { x: 80, y: 16 };
    const [next, patches, inverse] = produceWithPatches(useAppStore.getState().project, (d) => {
      const n = d.nodes.find((x) => x.id === id);
      if (n) n.position = to;
    });
    useAppStore.setState({ project: next });
    useAppStore.getState().recordManual('Move 1 nodes', patches, inverse);
    expect(useAppStore.getState().past.at(-1)?.label).toBe('Move 1 nodes');
    useAppStore.getState().undo();
    expect(useAppStore.getState().project.nodes[0]?.position).toEqual(from);
  });

  it('redo cleared after new dispatch', () => {
    useAppStore.getState().dispatch(addNodeFromCatalog('mini-pc', { x: 0, y: 0 }));
    useAppStore.getState().undo();
    expect(useAppStore.getState().future.length).toBeGreaterThan(0);
    useAppStore.getState().dispatch(addNodeFromCatalog('router', { x: 8, y: 8 }));
    expect(useAppStore.getState().future).toHaveLength(0);
  });

  it('past capped at 200', () => {
    for (let i = 0; i < 210; i++) {
      clock.setNow(() => 1_000_000 + i * 2000);
      useAppStore.getState().dispatch(addNodeFromCatalog('mini-pc', { x: i * 8, y: 0 }));
    }
    expect(useAppStore.getState().past.length).toBe(200);
  });
});

import { useEffect } from 'react';
import { deleteLinks, deleteNodes } from '../store/commands.ts';
import { useAppStore } from '../store/index.ts';
import { flushNow } from '../persistence/autosave.ts';

function isTyping(el: EventTarget | null): boolean {
  if (!(el instanceof HTMLElement)) return false;
  const tag = el.tagName;
  return tag === 'INPUT' || tag === 'TEXTAREA' || el.isContentEditable;
}

export function useKeymap(opts: { readOnly?: boolean } = {}): void {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const mod = e.ctrlKey || e.metaKey;
      const typing = isTyping(e.target);
      if (typing && e.key !== 'Escape' && !(mod && e.key.toLowerCase() === 's')) return;

      const store = useAppStore.getState();

      if (e.key === 'Shift' && e.code === 'KeyD' && e.shiftKey && !mod) {
        /* handled below via e.key */
      }

      if (e.code === 'KeyD' && e.shiftKey && !mod && !typing) {
        e.preventDefault();
        store.setTheme(document.documentElement.classList.contains('dark') ? 'light' : 'dark');
        return;
      }

      if (mod && e.key.toLowerCase() === 'z') {
        e.preventDefault();
        if (e.shiftKey) store.redo();
        else store.undo();
        return;
      }
      if (mod && e.key.toLowerCase() === 'y') {
        e.preventDefault();
        store.redo();
        return;
      }
      if (mod && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void flushNow();
        return;
      }
      if (mod && e.key.toLowerCase() === 'a') {
        e.preventDefault();
        store.setSelection({
          nodeIds: store.project.nodes.map((n) => n.id),
          linkIds: [],
        });
        return;
      }
      if (e.key === 'Escape') {
        if (store.placing) {
          store.setPlacing(null);
          return;
        }
        if (store.selection.nodeIds.length || store.selection.linkIds.length) {
          store.setSelection({ nodeIds: [], linkIds: [] });
        }
        return;
      }
      if (opts.readOnly) return;
      if (e.key === 'Delete' || e.key === 'Backspace') {
        e.preventDefault();
        if (store.selection.nodeIds.length) store.dispatch(deleteNodes(store.selection.nodeIds));
        if (store.selection.linkIds.length) store.dispatch(deleteLinks(store.selection.linkIds));
        store.setSelection({ nodeIds: [], linkIds: [] });
      }
      if (e.key === 'F2' && store.selection.nodeIds[0]) {
        const el = document.querySelector('[aria-label="Node label"]') as HTMLInputElement | null;
        el?.focus();
        el?.select();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [opts.readOnly]);
}

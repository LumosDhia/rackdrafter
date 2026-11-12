import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { AuthError } from '../persistence/types.ts';
import { http, idb, startAutosave } from '../persistence/autosave.ts';
import { readMirror } from '../persistence/local.ts';
import { useAppStore } from '../store/index.ts';
import { Canvas } from '../canvas/Canvas.tsx';
import { CatalogPanel } from '../panels/CatalogPanel.tsx';
import { Inspector } from '../panels/Inspector.tsx';
import { IssuesPanel } from '../panels/IssuesPanel.tsx';
import { TopBar } from '../chrome/TopBar.tsx';
import { OfflineBanner } from '../chrome/OfflineBanner.tsx';
import { TokenDialog } from '../chrome/TokenDialog.tsx';

export function EditorPage({ id }: { id: string }) {
  const [ready, setReady] = useState(false);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panels = useAppStore((s) => s.panels);

  useEffect(() => {
    startAutosave();
    let cancelled = false;
    void (async () => {
      try {
        const got = await http.get(id);
        if (cancelled) return;
        if (!got) {
          const local = await idb.get(id);
          if (local) {
            useAppStore
              .getState()
              .loadProject(local.document, { id: local.meta.id, docSeq: local.meta.docSeq });
            useAppStore.getState().setOffline(true);
            setReady(true);
            return;
          }
          setError('Project not found');
          setReady(true);
          return;
        }
        const mirror = readMirror(id);
        if (mirror?.dirty && mirror.baseSeq === got.meta.docSeq) {
          useAppStore.getState().loadProject(mirror.document, { id, docSeq: got.meta.docSeq });
          useAppStore.getState().setSaveState('dirty');
        } else {
          useAppStore.getState().loadProject(got.document, { id, docSeq: got.meta.docSeq });
        }
        setReady(true);
      } catch (err) {
        if (err instanceof AuthError) {
          setTokenOpen(true);
          setReady(true);
          return;
        }
        const local = await idb.get(id);
        if (local) {
          useAppStore
            .getState()
            .loadProject(local.document, { id: local.meta.id, docSeq: local.meta.docSeq });
          useAppStore.getState().setOffline(true);
        } else {
          setError(err instanceof Error ? err.message : 'Failed to load');
        }
        setReady(true);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [id]);

  if (!ready) {
    return <div className="p-6 text-[13px] text-[hsl(var(--fg-muted))]">Loading…</div>;
  }
  if (error) {
    return (
      <div className="p-6">
        <p className="text-[13px]">{error}</p>
        <a href="/" className="text-[hsl(var(--accent))]">
          Projects
        </a>
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <TopBar />
      <OfflineBanner />
      <div className="flex min-h-0 flex-1">
        {panels.palette ? <CatalogPanel /> : null}
        <div className="flex min-w-0 flex-1 flex-col">
          <ReactFlowProvider>
            <Canvas />
          </ReactFlowProvider>
          {panels.drawer ? <IssuesPanel /> : null}
        </div>
        {panels.inspector ? <Inspector /> : null}
      </div>
      <TokenDialog open={tokenOpen} onClose={() => setTokenOpen(false)} />
    </div>
  );
}

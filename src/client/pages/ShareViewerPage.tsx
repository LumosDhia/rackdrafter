import { useEffect, useState } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { api } from '../api/client.ts';
import { useAppStore } from '../store/index.ts';
import { Canvas } from '../canvas/Canvas.tsx';
import { Inspector } from '../panels/Inspector.tsx';
import { TopBar } from '../chrome/TopBar.tsx';

export function ShareViewerPage({ token }: { token: string }) {
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const data = await api.getShare(token);
        useAppStore.getState().loadProject(data.document);
        setReady(true);
      } catch {
        setError('This share link is unknown, revoked, or expired.');
        setReady(true);
      }
    })();
  }, [token]);

  if (!ready) return <div className="p-6 text-[13px] text-[hsl(var(--fg-muted))]">Loading…</div>;
  if (error) return <div className="p-6 text-[13px]">{error}</div>;

  return (
    <div className="flex h-full flex-col">
      <TopBar readOnly />
      <div className="flex min-h-0 flex-1">
        <div className="min-w-0 flex-1">
          <ReactFlowProvider>
            <Canvas readOnly />
          </ReactFlowProvider>
        </div>
        <Inspector />
      </div>
    </div>
  );
}

import { ReactFlowProvider } from '@xyflow/react';
import { Canvas } from './canvas/Canvas.tsx';
import { useAppStore } from './store/index.ts';

export function App() {
  const project = useAppStore((s) => s.project);
  const undo = useAppStore((s) => s.undo);
  const redo = useAppStore((s) => s.redo);
  return (
    <div className="flex h-screen flex-col">
      <header className="flex items-center gap-3 border-b px-3 py-2 text-[13px]">
        <b>rackdrafter</b>
        <span>{project.name}</span>
        <button onClick={undo}>undo</button>
        <button onClick={redo}>redo</button>
      </header>
      <main className="min-h-0 flex-1">
        <ReactFlowProvider>
          <Canvas />
        </ReactFlowProvider>
      </main>
    </div>
  );
}

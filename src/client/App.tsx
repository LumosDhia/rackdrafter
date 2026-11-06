import { useAppStore } from './store/index.ts';

export function App() {
  const project = useAppStore((s) => s.project);
  const select = useAppStore((s) => s.select);
  return (
    <div style={{ padding: 24, fontFamily: 'sans-serif' }}>
      <h1>rackdrafter</h1>
      <ul>
        {project.nodes.map((n) => (
          <li key={n.id} onClick={() => select(n.id)}>
            {n.label} ({n.position.x}, {n.position.y})
          </li>
        ))}
      </ul>
    </div>
  );
}

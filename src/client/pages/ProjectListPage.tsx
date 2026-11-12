import { useEffect, useState } from 'react';
import { http, idb } from '../persistence/autosave.ts';
import type { ProjectMeta } from '../persistence/types.ts';
import { AuthError } from '../persistence/types.ts';
import { navigate } from '../router.tsx';
import { SEEDS } from '#shared/seeds/index.ts';
import { Button } from '../ui/Button.tsx';
import { Glyph } from '../ui/Glyph.tsx';
import { TokenDialog } from '../chrome/TokenDialog.tsx';

export function ProjectListPage() {
  const [projects, setProjects] = useState<ProjectMeta[]>([]);
  const [tokenOpen, setTokenOpen] = useState(false);
  const [offline, setOffline] = useState(false);

  async function refresh() {
    try {
      const list = await http.list();
      setProjects(list);
      setOffline(false);
    } catch (err) {
      if (err instanceof AuthError) setTokenOpen(true);
      const local = await idb.list();
      setProjects(local);
      setOffline(true);
    }
  }

  useEffect(() => {
    let alive = true;
    void (async () => {
      try {
        const list = await http.list();
        if (!alive) return;
        setProjects(list);
        setOffline(false);
      } catch (err) {
        if (!alive) return;
        if (err instanceof AuthError) setTokenOpen(true);
        const local = await idb.list();
        if (!alive) return;
        setProjects(local);
        setOffline(true);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function create(fromSeed?: 'homelab' | 'k3s-cicd', name?: string) {
    const body = fromSeed ? { name: name ?? 'Untitled', fromSeed } : { name: 'Untitled' };
    try {
      const created = await http.create(body);
      navigate(`/p/${created.meta.id}`);
    } catch {
      const created = await idb.create(body);
      navigate(`/p/${created.meta.id}`);
    }
  }

  return (
    <div className="mx-auto max-w-3xl p-8">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-[20px] font-semibold leading-[26px]">Projects</h1>
          <p className="mt-1 text-[13px] text-[hsl(var(--fg-muted))]">
            {offline ? 'Server unreachable. Showing local copies.' : 'Open a design or start a blank canvas.'}
          </p>
        </div>
        <Button variant="primary" onClick={() => void create()}>
          New project
        </Button>
      </div>
      <div className="mb-6 grid grid-cols-2 gap-2">
        {SEEDS.map((seed) => (
          <button
            key={seed.id}
            type="button"
            onClick={() => void create(seed.id, seed.name)}
            className="rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))] p-3 text-left transition-colors hover:border-[hsl(var(--border-strong))] hover:bg-[hsl(var(--surface-2))]"
          >
            <span className="flex items-center gap-2 text-[13px] font-medium">
              <Glyph name={seed.id === 'k3s-cicd' ? 'hexagons' : 'server'} size={15} />
              {seed.name}
            </span>
            <span className="mt-1 block text-[12px] leading-[17px] text-[hsl(var(--fg-muted))]">
              {seed.description}
            </span>
          </button>
        ))}
      </div>
      <ul className="divide-y divide-[hsl(var(--border))] rounded-[8px] border border-[hsl(var(--border))] bg-[hsl(var(--surface))]">
        {projects.length === 0 ? (
          <li className="px-4 py-8 text-center text-[13px] text-[hsl(var(--fg-muted))]">No projects yet.</li>
        ) : (
          projects.map((p) => (
            <li key={p.id}>
              <a
                href={`/p/${p.id}`}
                className="flex items-center gap-3 px-4 py-3 text-[13px] text-[hsl(var(--fg))] no-underline hover:bg-[hsl(var(--surface-2))]"
                onClick={(e) => {
                  e.preventDefault();
                  navigate(`/p/${p.id}`);
                }}
              >
                <Glyph name="box" size={16} />
                <span className="font-medium">{p.name}</span>
                <span className="ml-auto font-mono text-[11px] text-[hsl(var(--fg-subtle))]">
                  {p.nodeCount} nodes
                </span>
              </a>
            </li>
          ))
        )}
      </ul>
      <TokenDialog
        open={tokenOpen}
        onClose={() => {
          setTokenOpen(false);
          void refresh();
        }}
      />
    </div>
  );
}

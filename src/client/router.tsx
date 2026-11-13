import { useEffect, useState, type ReactNode } from 'react';
import { useKeymap } from './keyboard/useKeymap.ts';
import { EditorPage } from './pages/EditorPage.tsx';
import { ProjectListPage } from './pages/ProjectListPage.tsx';
import { ShareViewerPage } from './pages/ShareViewerPage.tsx';

export function navigate(to: string): void {
  history.pushState(null, '', to);
  window.dispatchEvent(new PopStateEvent('popstate'));
}

export function Router(): ReactNode {
  const [path, setPath] = useState(window.location.pathname);
  useKeymap({ readOnly: !path.startsWith('/p/') });
  useEffect(() => {
    const onPop = () => setPath(window.location.pathname);
    window.addEventListener('popstate', onPop);
    return () => window.removeEventListener('popstate', onPop);
  }, []);

  if (path === '/' || path === '') return <ProjectListPage />;
  const p = /^\/p\/([^/]+)$/.exec(path);
  if (p?.[1]) return <EditorPage id={p[1]} />;
  const s = /^\/s\/([^/]+)$/.exec(path);
  if (s?.[1]) return <ShareViewerPage token={s[1]} />;
  return (
    <div className="p-6 text-[13px]">
      Not found.{' '}
      <a href="/" className="text-[hsl(var(--accent))]">
        Home
      </a>
    </div>
  );
}

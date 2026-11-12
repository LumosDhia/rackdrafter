import { EditorPage } from './pages/EditorPage.tsx';
import { ProjectListPage } from './pages/ProjectListPage.tsx';
import { ShareViewerPage } from './pages/ShareViewerPage.tsx';

export function navigate(to: string) {
  window.location.href = to;
}

export function Router() {
  // no state, a full reload on every navigation. good enough until the editor has autosave
  const path = window.location.pathname;
  if (path === '/') return <ProjectListPage />;
  if (path.startsWith('/p/')) return <EditorPage id={path.slice(3)} />;
  if (path.startsWith('/s/')) return <ShareViewerPage token={path.slice(3)} />;
  return <div>Not found</div>;
}

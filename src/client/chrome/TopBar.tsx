import { flushNow } from '../persistence/autosave.ts';
import { LINK_KINDS, type LinkKind } from '#shared/domain/types.ts';
import { useMemo } from 'react';
import { analyze, findingCounts } from '#shared/analysis/index.ts';
import { useAppStore } from '../store/index.ts';
import { Button, IconButton } from '../ui/Button.tsx';
import { Glyph } from '../ui/Glyph.tsx';
import { Input } from '../ui/Field.tsx';
import { api } from '../api/client.ts';

const saveLabel: Record<string, string> = {
  saved: 'Saved',
  saving: 'Saving…',
  dirty: 'Unsaved',
  error: 'Save failed',
  offline: 'Offline',
  conflict: 'Conflict',
};

export function TopBar({ readOnly = false }: { readOnly?: boolean }) {
  const project = useAppStore((s) => s.project);
  const saveState = useAppStore((s) => s.saveState);
  const theme = useAppStore((s) => s.theme);
  const tool = useAppStore((s) => s.tool);
  const projectId = useAppStore((s) => s.projectId);
  const linkKind = useAppStore((s) => s.linkKind);
  // Derive outside the store selector: returning a fresh object from a Zustand
  // selector re-renders forever.
  const counts = useMemo(() => findingCounts(analyze(project)), [project]);
  const drawer = useAppStore((s) => s.panels.drawer);

  return (
    <header className="flex h-11 shrink-0 items-center gap-3 border-b border-[hsl(var(--border))] bg-[hsl(var(--surface))] px-3">
      <a
        href="/"
        className="flex items-center gap-2 text-[13px] font-medium text-[hsl(var(--fg))] no-underline"
      >
        <Glyph name="box" size={16} />
        RackDrafter
      </a>
      {readOnly ? (
        <span className="text-[13px] font-medium">{project.name}</span>
      ) : (
        <Input
          value={project.name}
          aria-label="Project name"
          className="h-7 w-48"
          onChange={(e) => {
            const name = e.target.value.slice(0, 80);
            useAppStore.getState().transact('Rename project', (d) => {
              d.name = name;
            });
          }}
        />
      )}
      <span className="text-[12px] text-[hsl(var(--fg-subtle))]">{saveLabel[saveState] ?? saveState}</span>
      <div className="mx-auto flex items-center gap-1">
        <IconButton
          label="Select"
          className={tool === 'select' ? 'bg-[hsl(var(--surface-2))]' : ''}
          onClick={() => useAppStore.getState().setTool('select')}
        >
          <Glyph name="pointer" size={16} />
        </IconButton>
        <IconButton
          label="Hand"
          className={tool === 'pan' ? 'bg-[hsl(var(--surface-2))]' : ''}
          onClick={() => useAppStore.getState().setTool('pan')}
        >
          <Glyph name="hand-stop" size={16} />
        </IconButton>
      </div>
      {!readOnly ? (
        <label className="ml-auto flex items-center gap-1.5 text-[12px] text-[hsl(var(--fg-muted))]">
          <span className="hidden text-[11px] uppercase tracking-wide text-[hsl(var(--fg-subtle))] lg:inline">
            link
          </span>
          <select
            aria-label="Link kind"
            value={linkKind}
            onChange={(e) => useAppStore.getState().setLinkKind(e.target.value as LinkKind | 'auto')}
            className="h-7 rounded-[5px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] px-1.5 text-[12px]"
          >
            <option value="auto">auto</option>
            {LINK_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kind}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="ml-auto flex items-center gap-1">
        {!readOnly ? (
          <button
            type="button"
            aria-pressed={drawer}
            data-testid="findings-toggle"
            onClick={() => useAppStore.getState().togglePanel('drawer')}
            className={`mr-1 flex h-7 items-center gap-1.5 rounded-[5px] border px-1.5 text-[11.5px] tabular-nums ${
              counts.error > 0
                ? 'border-[hsl(var(--danger))]/40 text-[hsl(var(--danger))]'
                : 'border-[hsl(var(--border))] text-[hsl(var(--fg-muted))]'
            }`}
            title={`${counts.error} errors, ${counts.warning} warnings, ${counts.info} info`}
          >
            <Glyph name="alert-triangle" size={13} />
            <span>{counts.error}</span>
            <span className="text-[hsl(var(--fg-subtle))]">/</span>
            <span>{counts.warning}</span>
            <span className="sr-only">errors and warnings, toggle findings panel</span>
          </button>
        ) : null}
        {!readOnly && projectId ? (
          <Button
            size={28}
            onClick={async () => {
              const share = await api.createShare(projectId, { versionNo: null, expiresInDays: null });
              await navigator.clipboard.writeText(`${location.origin}${share.share.url}`);
            }}
          >
            Share
          </Button>
        ) : null}
        <IconButton
          label="Toggle theme"
          onClick={() => useAppStore.getState().setTheme(theme === 'dark' ? 'light' : 'dark')}
        >
          <Glyph name={theme === 'dark' ? 'sun' : 'moon'} size={16} />
        </IconButton>
        <IconButton
          label="Save"
          onClick={() => {
            void flushNow();
          }}
        >
          <Glyph name="device-floppy" size={16} />
        </IconButton>
      </div>
    </header>
  );
}

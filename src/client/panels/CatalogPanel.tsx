/* eslint-disable react-hooks/incompatible-library -- TanStack Virtual returns stable
   imperative handles by design; the React Compiler cannot memoize them. */
import { useMemo, useRef, useState } from 'react';
import { useVirtualizer } from '@tanstack/react-virtual';
import { DEVICES, SERVICES, searchCatalog } from '#shared/catalog/index.ts';
import type { CatalogItem } from '#shared/catalog/types.ts';
import { categoryLabel } from '#shared/catalog/visuals.ts';
import { addNodeFromCatalog } from '../store/commands.ts';
import { http } from '../persistence/autosave.ts';
import { navigate } from '../router.tsx';
import { SEEDS } from '#shared/seeds/index.ts';
import { useAppStore } from '../store/index.ts';
import { DND_MIME } from '../canvas/dnd.ts';
import { IconTile } from '../ui/IconTile.tsx';
import { Glyph } from '../ui/Glyph.tsx';
import { manifestSummary } from '../ui/icons.ts';

type Tab = 'device' | 'service';

type Row =
  | { key: string; kind: 'header'; label: string; count: number }
  | { key: string; kind: 'item'; item: CatalogItem };

function insert(item: CatalogItem): void {
  const store = useAppStore.getState();
  const n = store.project.nodes.length;
  store.dispatch(
    addNodeFromCatalog(item.slug, {
      x: 240 + (n % 5) * 32,
      y: 180 + Math.floor(n / 5) * 32,
    }),
  );
  const last = useAppStore.getState().project.nodes.at(-1);
  if (last) store.setSelection({ nodeIds: [last.id], linkIds: [] });
  store.setPlacing(null);
}

function score(item: CatalogItem, q: string): number {
  const name = item.name.toLowerCase();
  if (name === q) return 0;
  if (name.startsWith(q)) return 1;
  if (name.includes(q)) return 2;
  if (item.tags.some((t) => t.startsWith(q))) return 3;
  return 4;
}

function buildRows(tab: Tab, query: string): Row[] {
  const all = tab === 'device' ? DEVICES : SERVICES;
  const q = query.trim().toLowerCase();
  if (q) {
    const items = searchCatalog(q)
      .filter((i) => i.kind === tab)
      .sort((a, b) => score(a, q) - score(b, q) || a.name.localeCompare(b.name));
    const rows: Row[] = [];
    for (const item of items) rows.push({ key: item.slug, kind: 'item', item });
    return rows;
  }
  const rows: Row[] = [];
  let lastCategory = '';
  let header: Row | null = null;
  for (const item of all) {
    if (item.category !== lastCategory) {
      header = { key: `h-${item.category}`, kind: 'header', label: categoryLabel(item), count: 0 };
      rows.push(header);
      lastCategory = item.category;
    }
    rows.push({ key: item.slug, kind: 'item', item });
    if (header) header.count += 1;
  }
  return rows;
}

export function CatalogPanel() {
  const [q, setQ] = useState('');
  const [tab, setTab] = useState<Tab>('device');
  const placing = useAppStore((s) => s.placing);
  const isEmptyProject = useAppStore((s) => s.project.nodes.length === 0);
  const rows = useMemo(() => buildRows(tab, q), [tab, q]);
  const scrollRef = useRef<HTMLDivElement | null>(null);

  const virtualizer = useVirtualizer({
    count: rows.length,
    getScrollElement: () => scrollRef.current,
    estimateSize: (i) => (rows[i]?.kind === 'header' ? 26 : 34),
    overscan: 10,
  });

  const itemCount = rows.filter((r) => r.kind === 'item').length;
  const summary = manifestSummary();

  return (
    <aside
      aria-label="Catalog"
      className="flex h-full w-[272px] shrink-0 flex-col border-r border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
    >
      <div className="flex flex-col gap-2 border-b border-[hsl(var(--border))] px-2.5 pb-2 pt-2.5">
        <div className="relative">
          <Glyph
            name="search"
            size={14}
            className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[hsl(var(--fg-subtle))]"
          />
          <input
            aria-label="Search catalog"
            placeholder="Search devices and services"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                const first = rows.find((r) => r.kind === 'item');
                if (first && first.kind === 'item') insert(first.item);
              }
              if (e.key === 'Escape') setQ('');
            }}
            className="h-7 w-full rounded-[5px] border border-[hsl(var(--border))] bg-[hsl(var(--surface-2))] pl-7 pr-2 text-[12.5px] placeholder:text-[hsl(var(--fg-subtle))]"
          />
        </div>
        <div
          role="tablist"
          aria-label="Catalog kind"
          className="flex h-7 items-center gap-0.5 rounded-[5px] bg-[hsl(var(--surface-2))] p-0.5"
        >
          {(
            [
              ['device', `Devices ${DEVICES.length}`],
              ['service', `Services ${SERVICES.length}`],
            ] as [Tab, string][]
          ).map(([value, label]) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={tab === value}
              onClick={() => setTab(value)}
              className={`h-6 flex-1 rounded-[4px] text-[12px] font-medium transition-colors ${
                tab === value
                  ? 'bg-[hsl(var(--surface))] text-[hsl(var(--fg))] shadow-[var(--shadow-sm)]'
                  : 'text-[hsl(var(--fg-muted))] hover:text-[hsl(var(--fg))]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {isEmptyProject ? (
        <div className="border-b border-[hsl(var(--border))] px-2.5 py-2">
          <div className="section-label mb-1.5">Start from a template</div>
          <div className="flex flex-col gap-1">
            {SEEDS.map((seed) => (
              <button
                key={seed.id}
                type="button"
                onClick={async () => {
                  try {
                    const created = await http.create({ name: seed.name, fromSeed: seed.id });
                    navigate(`/p/${created.meta.id}`);
                  } catch {
                    /* offline: templates are served by the API */
                  }
                }}
                className="flex items-start gap-2 rounded-[5px] px-1.5 py-1.5 text-left hover:bg-[hsl(var(--surface-2))]"
              >
                <Glyph
                  name={seed.id === 'k3s-cicd' ? 'hexagons' : 'server'}
                  size={14}
                  className="mt-0.5 shrink-0 text-[hsl(var(--fg-subtle))]"
                />
                <span className="min-w-0">
                  <span className="block truncate text-[12.5px] text-[hsl(var(--fg))]">{seed.name}</span>
                  <span className="mt-0.5 block line-clamp-2 text-[10.5px] leading-[14px] text-[hsl(var(--fg-subtle))]">
                    {seed.description}
                  </span>
                </span>
              </button>
            ))}
          </div>
        </div>
      ) : null}

      <div
        ref={scrollRef}
        aria-label="Catalog items"
        className="min-h-0 flex-1 overflow-y-auto overflow-x-hidden px-1.5 py-1.5"
      >
        <div style={{ height: virtualizer.getTotalSize(), position: 'relative' }}>
          {virtualizer.getVirtualItems().map((v) => {
            const row = rows[v.index];
            if (!row) return null;
            if (row.kind === 'header') {
              return (
                <div
                  key={row.key}
                  className="section-label sticky top-0 z-[1] flex items-center justify-between bg-[hsl(var(--surface))] pl-1.5 pr-1"
                  style={{
                    position: 'absolute',
                    top: 0,
                    left: 0,
                    right: 0,
                    height: v.size,
                    transform: `translateY(${v.start}px)`,
                  }}
                >
                  <span>{row.label}</span>
                  <span className="tabular-nums text-[hsl(var(--fg-subtle))]">{row.count}</span>
                </div>
              );
            }
            const item = row.item;
            const active = placing === item.slug;
            return (
              <button
                key={row.key}
                type="button"
                aria-pressed={active}
                data-testid={`palette-item-${item.slug}`}
                draggable
                onDragStart={(e) => {
                  e.dataTransfer.setData(DND_MIME, item.slug);
                  e.dataTransfer.setData('text/plain', item.name);
                  e.dataTransfer.effectAllowed = 'copy';
                }}
                onClick={() => useAppStore.getState().setPlacing(active ? null : item.slug)}
                onDoubleClick={() => insert(item)}
                title={`${item.name} — ${item.description}`}
                className={`group flex items-center gap-2 rounded-[5px] px-1.5 text-left transition-colors ${
                  active
                    ? 'bg-[hsl(var(--accent-soft))] text-[hsl(var(--fg))]'
                    : 'hover:bg-[hsl(var(--surface-2))]'
                }`}
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: v.size,
                  transform: `translateY(${v.start}px)`,
                }}
              >
                <IconTile item={item} size={24} />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-[15px] text-[hsl(var(--fg))]">
                    {item.name}
                  </span>
                  <span className="block truncate text-[10.5px] leading-[13px] text-[hsl(var(--fg-subtle))]">
                    {item.kind === 'device'
                      ? `${item.defaults.cpu.cores || '—'}c · ${Math.round(item.defaults.ramMb / 1024) || '—'} GB`
                      : (item.defaults.image?.replace(/:.+$/, '') ?? item.defaults.runtime)}
                  </span>
                </span>
                <Glyph
                  name="plus"
                  size={13}
                  className="shrink-0 text-[hsl(var(--fg-subtle))] opacity-0 transition-opacity group-hover:opacity-100"
                />
              </button>
            );
          })}
        </div>
      </div>

      <div className="flex h-7 shrink-0 items-center justify-between border-t border-[hsl(var(--border))] px-2.5 text-[10.5px] text-[hsl(var(--fg-subtle))]">
        <span className="tabular-nums">
          {q ? `${itemCount} match${itemCount === 1 ? '' : 'es'}` : `${itemCount} items`}
        </span>
        <span className="tabular-nums">
          {summary.brands} logos · {summary.glyphOnly} glyphs
        </span>
      </div>
    </aside>
  );
}

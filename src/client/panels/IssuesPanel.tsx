import { useMemo, useState } from 'react';
import { analyze, costSummary, findingCounts, wanExposure } from '#shared/analysis/index.ts';
import type { Severity } from '#shared/analysis/types.ts';
import { useAppStore } from '../store/index.ts';
import { Glyph } from '../ui/Glyph.tsx';

type Tab = 'findings' | 'exposure' | 'cost';

export function IssuesPanel() {
  const project = useAppStore((s) => s.project);
  const [tab, setTab] = useState<Tab>('findings');
  const [filter, setFilter] = useState<Severity | 'all'>('all');

  const result = useMemo(() => analyze(project), [project]);
  const counts = useMemo(() => findingCounts(result), [result]);
  const exposure = useMemo(() => wanExposure(project), [project]);
  const cost = useMemo(() => costSummary(project), [project]);
  const { currency, electricityPricePerKwh } = project.settings;

  const shown = filter === 'all' ? result.findings : result.findings.filter((f) => f.severity === filter);
  const nodes = new Map(project.nodes.map((n) => [n.id, n]));

  return (
    <section
      aria-label="Findings"
      className="flex h-[260px] shrink-0 flex-col border-t border-[hsl(var(--border))] bg-[hsl(var(--surface))]"
    >
      <div className="flex h-9 items-center gap-1 border-b border-[hsl(var(--border))] px-2">
        <div role="tablist" aria-label="Analysis view" className="flex items-center gap-0.5">
          {(
            [
              ['findings', `Findings ${result.findings.length}`],
              ['exposure', `Exposure ${exposure.length}`],
              ['cost', 'Cost'],
            ] as [Tab, string][]
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              role="tab"
              aria-selected={tab === key}
              onClick={() => setTab(key)}
              className={`h-6 rounded-[4px] px-2 text-[12px] ${
                tab === key ? 'bg-[hsl(var(--surface-2))] font-medium' : 'text-[hsl(var(--fg-muted))]'
              }`}
            >
              {label}
            </button>
          ))}
        </div>

        {tab === 'findings' ? (
          <div className="ml-auto flex items-center gap-1">
            {(['all', 'error', 'warning', 'info'] as const).map((key) => (
              <button
                key={key}
                type="button"
                onClick={() => setFilter(key)}
                className={`h-6 rounded-[4px] px-1.5 font-mono text-[11px] tabular-nums ${
                  filter === key
                    ? 'bg-[hsl(var(--surface-2))] text-[hsl(var(--fg))]'
                    : 'text-[hsl(var(--fg-muted))]'
                }`}
                title={`Show ${key}`}
              >
                {key === 'all' ? result.findings.length : counts[key]}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'findings' ? (
        <div className="min-h-0 flex-1 overflow-y-auto">
          {shown.length === 0 ? (
            <p className="p-3 text-[12.5px] text-[hsl(var(--fg-muted))]">
              No findings in this category. This is a statement about the design, not a guarantee.
            </p>
          ) : (
            <ul className="divide-y divide-[hsl(var(--border))]">
              {shown.map((f) => (
                <li key={f.id}>
                  <button
                    type="button"
                    className="flex w-full items-start gap-2 px-2.5 py-1.5 text-left hover:bg-[hsl(var(--surface-2))]"
                    onClick={() =>
                      useAppStore.getState().setSelection({ nodeIds: f.subjects.slice(0, 1), linkIds: [] })
                    }
                  >
                    <Glyph
                      name={
                        f.severity === 'error'
                          ? 'alert-triangle'
                          : f.severity === 'warning'
                            ? 'alert-triangle'
                            : 'circle-check'
                      }
                      size={13}
                      className={`mt-0.5 shrink-0 ${
                        f.severity === 'error'
                          ? 'text-[hsl(var(--danger))]'
                          : f.severity === 'warning'
                            ? 'text-[hsl(var(--warning))]'
                            : 'text-[hsl(var(--info))]'
                      }`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="block text-[12.5px] leading-[16px] text-[hsl(var(--fg))]">
                        {f.message}
                      </span>
                      <span className="mt-0.5 block font-mono text-[10.5px] text-[hsl(var(--fg-subtle))]">
                        {f.ruleId} ·{' '}
                        {f.subjects
                          .map((id) => nodes.get(id)?.label ?? id)
                          .slice(0, 3)
                          .join(', ')}
                      </span>
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}

      {tab === 'exposure' ? (
        <div className="min-h-0 flex-1 overflow-y-auto p-2.5">
          {exposure.length === 0 ? (
            <p className="text-[12.5px] text-[hsl(var(--fg-muted))]">Nothing is published to the internet.</p>
          ) : (
            <table className="w-full text-[12px]">
              <thead>
                <tr className="text-left text-[hsl(var(--fg-subtle))]">
                  <th className="pb-1 font-normal">Hostname</th>
                  <th className="pb-1 font-normal">Service</th>
                  <th className="pb-1 font-normal">Via</th>
                </tr>
              </thead>
              <tbody className="font-mono text-[11.5px]">
                {exposure.map((e) => (
                  <tr key={`${e.hostname}-${e.serviceId}`} className="border-t border-[hsl(var(--border))]">
                    <td className="py-1">{e.hostname}</td>
                    <td className="py-1 text-[hsl(var(--fg-muted))]">
                      {nodes.get(e.serviceId)?.label ?? e.serviceId}
                    </td>
                    <td className="py-1 text-[hsl(var(--fg-muted))]">{e.via}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      ) : null}

      {tab === 'cost' ? (
        <div className="grid grid-cols-2 gap-x-6 gap-y-1 p-3 text-[12.5px]">
          {[
            ['Hardware', `${cost.purchase.toLocaleString()} ${currency}`],
            ['Average draw', `${cost.watts} W`],
            ['Energy / month', `${cost.kwhPerMonth} kWh`],
            ['Power / month', `${cost.monthlyPower.toFixed(2)} ${currency}`],
            ['All-in / month', `${cost.monthlyTotal.toFixed(2)} ${currency}`],
            ['Tariff', `${electricityPricePerKwh} ${currency}/kWh`],
          ].map(([label, value]) => (
            <div key={label} className="flex items-baseline justify-between gap-2">
              <span className="text-[hsl(var(--fg-muted))]">{label}</span>
              <span className="font-mono text-[12px] tabular-nums">{value}</span>
            </div>
          ))}
          <p className="col-span-2 mt-1 text-[11.5px] leading-[16px] text-[hsl(var(--fg-subtle))]">
            Guests are excluded from the power draw so they are not counted twice; hardware cost is what the
            catalogue declares.
          </p>
        </div>
      ) : null}
    </section>
  );
}

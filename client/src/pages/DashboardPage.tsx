import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, LEVELS, type Dashboard, type DashboardFridge, type Level, type Window } from '../api.ts';
import { strings } from '../strings.ts';
import { fmtTemp, fmtTs } from '../format.ts';
import { FridgeCard } from '../components/FridgeCard.tsx';
import { StatusIcon } from '../components/Status.tsx';
import { href } from '../router.ts';

const WINDOW_KEY = 'fridge-watch.window';

function savedWindow(): Window {
  try {
    return localStorage.getItem(WINDOW_KEY) === '24h' ? '24h' : '7d';
  } catch {
    return '7d';
  }
}

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: Dashboard };

export function DashboardPage() {
  const s = strings.dashboard;
  const [window, setWindow] = useState<Window>(savedWindow);
  const [state, setState] = useState<State>({ kind: 'loading' });

  const load = useCallback(() => {
    setState({ kind: 'loading' });
    api
      .dashboard(window)
      .then((data) => setState({ kind: 'ok', data }))
      .catch((e: unknown) => setState({ kind: 'error', message: e instanceof ApiError && e.message === 'offline' ? strings.common.offline : strings.common.error(String((e as Error).message)) }));
  }, [window]);

  useEffect(load, [load]);

  const choose = (w: Window) => {
    setWindow(w);
    try {
      localStorage.setItem(WINDOW_KEY, w);
    } catch {
      /* private mode: the choice just is not remembered */
    }
  };

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold">{s.title}</h2>
          {state.kind === 'ok' && state.data.asOf && (
            <p className="text-sm text-slate-600">
              {s.asOf(state.data.asOf)} <span className="text-slate-400">({s.asOfHint})</span>
            </p>
          )}
        </div>
        {/* toggle + button fit on one row at 375 px (208 + 6 + ~125 of 343) */}
        <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
          <WindowToggle value={window} onChange={choose} />
          {/* D46: the report for the inspector's visit, same period as the dashboard (all branches; pick one there) */}
          <a
            href={
              state.kind === 'ok' && state.data.asOf && state.data.windowStart
                ? href.branchReport('all', { from: state.data.windowStart, to: state.data.asOf })
                : href.branchReport('all')
            }
            className="whitespace-nowrap rounded-lg border border-slate-800 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-800 hover:bg-slate-100 sm:px-3"
          >
            {strings.branchReport.button}
          </a>
        </div>
      </div>

      {state.kind === 'loading' && <p className="mt-6 text-slate-500">{strings.common.loading}</p>}
      {state.kind === 'error' && (
        <div className="mt-6 rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          <p>{state.message}</p>
          <button type="button" onClick={load} className="mt-2 rounded bg-red-700 px-3 py-1.5 font-medium text-white">
            {strings.common.retry}
          </button>
        </div>
      )}
      {state.kind === 'ok' && <DashboardBody data={state.data} />}
    </section>
  );
}

function WindowToggle({ value, onChange }: { value: Window; onChange: (w: Window) => void }) {
  const s = strings.dashboard.window;
  return (
    <div role="radiogroup" aria-label={s.label} className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5 text-sm">
      {(['7d', '24h'] as const).map((w) => (
        <button
          key={w}
          type="button"
          role="radio"
          aria-checked={value === w}
          onClick={() => onChange(w)}
          className={`rounded-md px-3 py-1.5 font-medium ${value === w ? 'bg-slate-800 text-white' : 'text-slate-700'}`}
        >
          {s[w]}
        </button>
      ))}
    </div>
  );
}

const COUNT_STYLE: Record<Level, string> = {
  red: 'bg-red-600 text-white',
  was_red: 'bg-white border-2 border-red-600 text-red-700',
  orange: 'bg-amber-400 text-amber-950',
  grey: 'no-data-stripes border border-dashed border-slate-500 text-slate-800',
  green: 'bg-green-600 text-white',
};

function DashboardBody({ data }: { data: Dashboard }) {
  const s = strings.dashboard;
  if (data.fridges.length === 0 || !data.asOf) {
    return <p className="mt-6 rounded-lg border border-dashed border-slate-400 bg-white p-4 text-slate-700">{s.empty}</p>;
  }
  const attention = data.fridges.filter((f) => f.level !== 'green');
  const ok = data.fridges.filter((f) => f.level === 'green');
  const okByBranch = new Map<string, DashboardFridge[]>();
  for (const f of ok) okByBranch.set(f.branch, [...(okByBranch.get(f.branch) ?? []), f]);
  const branchIds = new Map(data.fridges.map((f) => [f.branch, f.branchId]));
  const totalByBranch = new Map<string, number>();
  for (const f of data.fridges) totalByBranch.set(f.branch, (totalByBranch.get(f.branch) ?? 0) + 1);

  return (
    <>
      {/* phone: 3 + 2 on a 6-column grid (urgent row first), so every label fits on one line; sm and up: one row */}
      <ul aria-label={s.counts} className="mt-4 grid grid-cols-6 gap-2 sm:grid-cols-5">
        {LEVELS.map((l, i) => (
          <li key={l} className={`flex flex-col items-center rounded-lg px-1 py-2 sm:col-span-1 ${i < 3 ? 'col-span-2' : 'col-span-3'} ${COUNT_STYLE[l]}`}>
            <span className="text-2xl font-bold leading-none">{data.counts[l]}</span>
            <span className="mt-1 flex items-center gap-1 whitespace-nowrap text-center text-[11px] font-medium leading-tight">
              <StatusIcon level={l} className="h-3 w-3 shrink-0" />
              {strings.levelShort[l]}
            </span>
          </li>
        ))}
      </ul>

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {s.attention} ({attention.length})
      </h3>
      {attention.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{s.attentionNone}</p>
      ) : (
        <div className="mt-2 grid gap-3 sm:grid-cols-2">
          {attention.map((f) => (
            <FridgeCard key={f.id} fridge={f} />
          ))}
        </div>
      )}

      {/* the fridges that are fine stay out of the way: one row, opened on demand */}
      {ok.length > 0 && (
        <details className="group/ok mt-6 overflow-hidden rounded-lg border border-slate-200 bg-white">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-3">
            <span className="flex items-center gap-2 font-medium">
              <StatusIcon level="green" className="h-4 w-4 text-green-600" />
              {s.okAll(ok.length)}
            </span>
            <span className="text-sm text-slate-600 underline underline-offset-2">
              <span className="group-open/ok:hidden">{s.show}</span>
              <span className="hidden group-open/ok:inline">{s.hide}</span>
            </span>
          </summary>
          <div className="divide-y divide-slate-200 border-t border-slate-200">
            {[...okByBranch.entries()].map(([branch, list]) => {
              const total = totalByBranch.get(branch) ?? list.length;
              // a branch with fridges in "Needs attention" is not all fine: neutral dot, "1 of 3 fridges OK"
              const allOk = list.length === total;
              return (
                <details key={branch} className="group/branch">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
                    <span className="flex items-center gap-2 font-medium">
                      {allOk ? (
                        <StatusIcon level="green" className="h-4 w-4 text-green-600" />
                      ) : (
                        <span aria-hidden className="mx-1 h-2 w-2 rounded-full bg-slate-400" />
                      )}
                      {branch}
                    </span>
                    <span className="flex items-center gap-2 text-sm text-slate-500">
                      {allOk ? s.okBranch(list.length) : s.okBranchPartial(list.length, total)}
                      <span aria-hidden className="transition-transform group-open/branch:rotate-90">›</span>
                    </span>
                  </summary>
                  <ul className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm">
                    {list.map((f) => (
                      <li key={f.id} className="flex justify-between gap-2 py-1">
                        <a href={href.fridge(f.id)} className="underline decoration-slate-300 underline-offset-2 hover:decoration-slate-800">
                          {f.name}
                        </a>
                        <span className="text-slate-500">
                          {f.lastReading ? `${fmtTemp(f.lastReading.tempC)} · ${fmtTs(f.lastReading.ts)}` : s.noReading}
                        </span>
                      </li>
                    ))}
                    {/* D46: one printable document for the inspector's visit to this branch */}
                    <li className="pt-1">
                      <a href={href.branchReport(branchIds.get(branch) ?? 'all')} className="font-medium text-slate-700 underline underline-offset-2">
                        {strings.branchReport.link} ›
                      </a>
                    </li>
                  </ul>
                </details>
              );
            })}
          </div>
        </details>
      )}
      {/* D46: reachable even for a branch with no OK fridge (its row above would not exist) */}
      <p className="mt-4 text-sm">
        <a href={href.branchReport('all')} className="text-slate-700 underline underline-offset-2">
          {strings.branchReport.dashboardLink} ›
        </a>
      </p>
    </>
  );
}

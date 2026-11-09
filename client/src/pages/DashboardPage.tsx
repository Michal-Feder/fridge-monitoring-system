import { useCallback, useEffect, useState } from 'react';
import { api, ApiError, type Dashboard, type DashboardFridge, type Level, type Window } from '../api.ts';
import { strings } from '../strings.ts';
import { fmtTemp, fmtTs } from '../format.ts';
import { FridgeCard } from '../components/FridgeCard.tsx';
import { StatusIcon } from '../components/Status.tsx';

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
        <WindowToggle value={window} onChange={choose} />
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

  return (
    <>
      <ul aria-label={s.counts} className="mt-4 grid grid-cols-4 gap-2">
        {(['red', 'orange', 'grey', 'green'] as const).map((l) => (
          <li key={l} className={`flex flex-col items-center rounded-lg px-1 py-2 ${COUNT_STYLE[l]}`}>
            <span className="text-2xl font-bold leading-none">{data.counts[l]}</span>
            <span className="mt-1 flex items-center gap-1 text-center text-[11px] font-medium leading-tight">
              <StatusIcon level={l} className="h-3 w-3 shrink-0" />
              {strings.level[l]}
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

      <h3 className="mt-6 text-sm font-semibold uppercase tracking-wide text-slate-600">
        {s.ok} ({ok.length})
      </h3>
      <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {[...okByBranch.entries()].map(([branch, list]) => (
          <details key={branch} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
              <span className="flex items-center gap-2 font-medium">
                <StatusIcon level="green" className="h-4 w-4 text-green-600" />
                {branch}
              </span>
              <span className="flex items-center gap-2 text-sm text-slate-500">
                {s.okBranch(list.length)}
                <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              </span>
            </summary>
            <ul className="border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm">
              {list.map((f) => (
                <li key={f.id} className="flex justify-between gap-2 py-1">
                  <span>{f.name}</span>
                  <span className="text-slate-500">
                    {f.lastReading ? `${fmtTemp(f.lastReading.tempC)} · ${fmtTs(f.lastReading.ts)}` : s.noReading}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </>
  );
}

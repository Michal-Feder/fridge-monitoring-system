import { useEffect, useState } from 'react';
import { api, errorMessage, type BranchInfo, type FridgeReport, type Range } from '../api.ts';
import { strings } from '../strings.ts';
import { fmtDuration, fmtTemp, fmtTs, keepUnits, tsDate } from '../format.ts';
import { href } from '../router.ts';

const errorText = (e: unknown) => errorMessage(e, strings.common);

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: FridgeReport };

/**
 * Inspector report: fridge + period -> the server's plain-English sentences (core/report.ts), every
 * excursion (spikes labelled, never filtered out), gaps and reliability notes. Prints on its own (print CSS).
 */
export function ReportPage({ id, range }: { id: number; range: Partial<Range> }) {
  const s = strings.report;
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  useEffect(() => {
    setState({ kind: 'loading' });
    api.report(id, range).then(
      (data) => setState({ kind: 'ok', data }),
      (e: unknown) => setState({ kind: 'error', message: errorText(e) }),
    );
    // the range object is new on every hash change; its two strings are what matter
  }, [id, range.from, range.to]);

  useEffect(() => {
    api.branches().then(setBranches, () => setBranches([]));
  }, []);

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm print:hidden">
        <a href={href.fridge(id, range)} className="text-slate-600 underline underline-offset-2">
          {s.back}
        </a>
        {state.kind === 'ok' && (
          // D46: the inspector visits a branch; this prints every fridge of it in one document
          <a href={href.branchReport(state.data.fridge.branchId, state.data.range ?? range)} className="rounded-lg border border-slate-800 px-3 py-1.5 font-medium">
            {s.wholeBranch(state.data.fridge.branch)}
          </a>
        )}
      </div>
      {state.kind === 'ok' && state.data.range && <ReportForm id={id} range={state.data.range} branches={branches} />}
      {state.kind === 'loading' && <p className="text-slate-500">{strings.common.loading}</p>}
      {state.kind === 'error' && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ok' && <ReportBody data={state.data} />}
    </section>
  );
}

function ReportForm({ id, range, branches }: { id: number; range: Range; branches: BranchInfo[] }) {
  const s = strings.report;
  const f = strings.fridge;
  const [fridge, setFridge] = useState(String(id));
  const [from, setFrom] = useState(tsDate(range.from));
  const [to, setTo] = useState(tsDate(range.to));
  const input = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-base';
  return (
    <form
      className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.hash = href.report(Number(fridge), { from, to });
      }}
    >
      <label className="col-span-2 text-sm font-medium sm:col-span-1">
        {s.fridge}
        <select value={fridge} onChange={(e) => setFridge(e.target.value)} className={input}>
          {branches.length === 0 && <option value={id}>{id}</option>}
          {branches.map((b) => (
            <optgroup key={b.id} label={b.name}>
              {b.fridges.map((x) => (
                <option key={x.id} value={x.id}>
                  {b.name} / {x.name}
                </option>
              ))}
            </optgroup>
          ))}
        </select>
      </label>
      <label className="text-sm font-medium">
        {f.from}
        <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} required />
      </label>
      <label className="text-sm font-medium">
        {f.to}
        <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} required />
      </label>
      <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white">
        {f.show}
      </button>
      <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-800 px-3 py-2 text-sm font-medium">
        {s.print}
      </button>
    </form>
  );
}

/** One fridge's report; also used for every fridge of the branch report (D46). */
export function ReportBody({ data }: { data: FridgeReport }) {
  const s = strings.report;
  const f = strings.fridge;
  const th = 'border-b border-slate-300 px-2 py-1.5 text-left font-semibold';
  const td = 'border-b border-slate-200 px-2 py-1.5 align-top';
  // D40: time before the first / after the last reading is missing too, listed with the gaps
  const cov = data.report.coverage;
  const missing = [...cov.uncovered, ...data.gaps].sort((a, b) => (a.from < b.from ? -1 : 1));
  return (
    <article className="report rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
      <header className="border-b border-slate-200 pb-3">
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.title}</p>
        <h2 className="text-xl font-semibold">
          {data.fridge.branch} / {data.fridge.name}
        </h2>
        {data.range && <p className="text-sm text-slate-600">{s.period(data.range.from, data.range.to)}</p>}
        {data.range && (
          <p className={`text-sm font-medium ${cov.percent < 100 ? 'text-amber-800' : 'text-slate-600'}`}>{s.coverage(cov.percent, cov.missingMinutes)}</p>
        )}
      </header>

      <p className="mt-3 text-lg font-medium">{keepUnits(data.report.headline)}</p>
      {data.report.sentences.map((x) => (
        <p key={x} className="mt-1">
          {keepUnits(x)}
        </p>
      ))}

      <h3 className="mt-5 font-semibold">{s.events}</h3>
      {data.events.length === 0 ? (
        <p className="text-sm text-slate-600">{s.eventsNone}</p>
      ) : (
        // tables scroll inside their own box on a phone; the page itself never scrolls sideways
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[32rem] border-collapse text-sm print:min-w-0">
            <thead>
              <tr>
                <th className={th}>{s.cols.when}</th>
                <th className={th}>{s.cols.duration}</th>
                <th className={th}>{s.cols.peak}</th>
                <th className={th}>{s.cols.kind}</th>
              </tr>
            </thead>
            <tbody>
              {data.events.map((e) => (
                <tr key={e.firstHigh}>
                  <td className={td}>{f.eventWhen(e)}</td>
                  <td className={td}>{f.eventDuration(e)}</td>
                  <td className={`${td} whitespace-nowrap`}>{fmtTemp(e.peak)}</td>
                  <td className={td}>{f.eventClass[e.class]}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {missing.length > 0 && (
        <>
          <h3 className="mt-5 font-semibold">{s.gaps}</h3>
          <div className="mt-1 overflow-x-auto">
            <table className="w-full min-w-[24rem] border-collapse text-sm print:min-w-0">
              <thead>
                <tr>
                  <th className={th}>{s.cols2.from}</th>
                  <th className={th}>{s.cols2.to}</th>
                  <th className={th}>{s.cols2.length}</th>
                </tr>
              </thead>
              <tbody>
                {missing.map((g) => (
                  <tr key={g.from}>
                    <td className={td}>{fmtTs(g.from)}</td>
                    <td className={td}>{fmtTs(g.to)}</td>
                    <td className={td}>{fmtDuration(g.minutes)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      <h3 className="mt-5 font-semibold">{s.notes}</h3>
      <ul className="mt-1 list-inside list-disc space-y-1 text-sm text-slate-700">
        {data.report.notes.map((n) => (
          <li key={n}>{keepUnits(n)}</li>
        ))}
      </ul>
    </article>
  );
}

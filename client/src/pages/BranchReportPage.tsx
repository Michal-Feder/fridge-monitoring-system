import { useEffect, useState } from 'react';
import { api, errorMessage, type BranchInfo, type BranchReport, type Range } from '../api.ts';
import { strings } from '../strings.ts';
import { fmtTemp, tsDate } from '../format.ts';
import { href } from '../router.ts';
import { ReportBody } from './ReportPage.tsx';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: BranchReport };

/**
 * D46: one printable document for the inspector's visit to a branch (or all branches): a summary table, then each
 * fridge's full report (the same one as the fridge report page), each starting on a new page when printed.
 */
export function BranchReportPage({ branch, range }: { branch: number | 'all'; range: Partial<Range> }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const [branches, setBranches] = useState<BranchInfo[]>([]);

  useEffect(() => {
    setState({ kind: 'loading' });
    api.branchReport(branch, range).then(
      (data) => setState({ kind: 'ok', data }),
      (e: unknown) => setState({ kind: 'error', message: errorMessage(e, strings.common) }),
    );
    // the range object is new on every hash change; its two strings are what matter
  }, [branch, range.from, range.to]);

  useEffect(() => {
    api.branches().then(setBranches, () => setBranches([]));
  }, []);

  return (
    <section className="space-y-4">
      {state.kind === 'ok' && state.data.range && <Form branch={branch} range={state.data.range} branches={branches} />}
      {state.kind === 'loading' && <p className="text-slate-500">{strings.common.loading}</p>}
      {state.kind === 'error' && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ok' && <Body data={state.data} />}
    </section>
  );
}

function Form({ branch, range, branches }: { branch: number | 'all'; range: Range; branches: BranchInfo[] }) {
  const s = strings.branchReport;
  const f = strings.fridge;
  const [choice, setChoice] = useState(String(branch));
  const [from, setFrom] = useState(tsDate(range.from));
  const [to, setTo] = useState(tsDate(range.to));
  const input = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-base';
  return (
    <form
      className="grid grid-cols-2 items-end gap-2 rounded-lg border border-slate-200 bg-white p-3 sm:grid-cols-[2fr_1fr_1fr_auto_auto] print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        window.location.hash = href.branchReport(choice === 'all' ? 'all' : Number(choice), { from, to });
      }}
    >
      <label className="col-span-2 text-sm font-medium sm:col-span-1">
        {s.branch}
        <select value={choice} onChange={(e) => setChoice(e.target.value)} className={input}>
          <option value="all">{s.all}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
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
        {strings.report.print}
      </button>
    </form>
  );
}

function Body({ data }: { data: BranchReport }) {
  const s = strings.branchReport;
  const f = strings.fridge;
  const th = 'border-b border-slate-300 px-2 py-1.5 text-left font-semibold';
  const td = 'border-b border-slate-200 px-2 py-1.5 align-top';
  const several = data.scope.branchId === null;
  return (
    <>
      <article className="report rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
        <header className="border-b border-slate-200 pb-3">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.title}</p>
          <h2 className="text-xl font-semibold">{data.scope.name}</h2>
          {data.range && <p className="text-sm text-slate-600">{strings.report.period(data.range.from, data.range.to)}</p>}
          <p className="mt-1 text-sm text-slate-600">{s.intro(data.summary.length)}</p>
        </header>
        <h3 className="mt-4 font-semibold">{s.summary}</h3>
        {/* the table scrolls inside its own box on a phone; the page never scrolls sideways */}
        <div className="mt-1 overflow-x-auto">
          <table className="w-full min-w-[34rem] border-collapse text-sm print:min-w-0">
            <thead>
              <tr>
                <th className={th}>{s.cols.fridge}</th>
                <th className={th}>{s.cols.times}</th>
                <th className={th}>{s.cols.longest}</th>
                <th className={th}>{s.cols.peak}</th>
                <th className={th}>{s.cols.coverage}</th>
              </tr>
            </thead>
            <tbody>
              {data.summary.map((r) => (
                <tr key={r.fridge.id}>
                  <td className={td}>
                    {/* a button, not href="#...": the hash is the app's route (router.ts) */}
                    <button
                      type="button"
                      onClick={() => document.getElementById(`fridge-${r.fridge.id}`)?.scrollIntoView({ behavior: 'smooth' })}
                      className="text-left underline decoration-slate-300 underline-offset-2"
                    >
                      {several ? `${r.fridge.branch} / ${r.fridge.name}` : r.fridge.name}
                    </button>
                  </td>
                  <td className={`${td} ${r.times ? 'font-semibold text-red-800' : ''}`}>{s.times(r.times, r.spikes)}</td>
                  <td className={td}>{r.longest ? f.eventDuration({ ...r.longest, startsAtDataStart: false }) : s.none}</td>
                  <td className={`${td} whitespace-nowrap`}>{r.peak === null ? s.none : fmtTemp(r.peak)}</td>
                  <td className={`${td} whitespace-nowrap ${r.coverage < 100 ? 'font-semibold text-amber-800' : ''}`}>{s.coverage(r.coverage)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>
      {data.fridges.map((r) => (
        // each fridge starts on a new page when printed, so the summary stays alone on page 1
        <div key={r.fridge.id} id={`fridge-${r.fridge.id}`} className="scroll-mt-4 print:break-before-page">
          <ReportBody data={r} />
        </div>
      ))}
    </>
  );
}

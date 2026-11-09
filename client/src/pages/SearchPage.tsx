import { useEffect, useState } from 'react';
import { api, errorMessage, type Certainty, type SearchQuery, type SearchResult } from '../api.ts';
import { strings } from '../strings.ts';
import { fmtTemp, tsDate } from '../format.ts';
import { href } from '../router.ts';

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: SearchResult };

/** The query lives in the URL (#/search?above=5&minMinutes=30...), so a search can be bookmarked or shared. */
function fromUrl(q: URLSearchParams): SearchQuery {
  return {
    above: q.get('above') ?? '5',
    minMinutes: q.get('minMinutes') ?? '30',
    certainty: q.get('certainty') === 'certainly' ? 'certainly' : 'possibly',
    ...(q.get('from') ? { from: q.get('from')! } : {}),
    ...(q.get('to') ? { to: q.get('to')! } : {}),
  };
}

export function SearchPage({ query }: { query: URLSearchParams }) {
  const s = strings.search;
  const q = fromUrl(query);
  const key = query.toString();
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    setState({ kind: 'loading' });
    api.search(fromUrl(new URLSearchParams(key))).then(
      (data) => setState({ kind: 'ok', data }),
      (e: unknown) => setState({ kind: 'error', message: errorMessage(e, strings.common) }),
    );
  }, [key]);

  return (
    <section className="space-y-4">
      <div className="print:hidden">
        <h2 className="text-xl font-semibold">{s.title}</h2>
        <p className="text-sm text-slate-600">{s.intro}</p>
      </div>
      {/* keyed by the URL so the fields show the query that is on screen */}
      <SearchForm key={key} initial={q} resolved={state.kind === 'ok' ? state.data.query : null} />
      {state.kind === 'loading' && <p className="text-slate-500">{strings.common.loading}</p>}
      {state.kind === 'error' && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ok' && <Results data={state.data} />}
    </section>
  );
}

function SearchForm({ initial, resolved }: { initial: SearchQuery; resolved: SearchResult['query'] | null }) {
  const s = strings.search;
  const [above, setAbove] = useState(initial.above);
  const [minMinutes, setMinMinutes] = useState(initial.minMinutes);
  const [certainty, setCertainty] = useState<Certainty>(initial.certainty);
  // empty dates mean "the 7 days up to the latest data" (D34); once the server answers, show those dates
  const [from, setFrom] = useState(initial.from ?? '');
  const [to, setTo] = useState(initial.to ?? '');
  useEffect(() => {
    if (resolved && !initial.from) setFrom(tsDate(resolved.from));
    if (resolved && !initial.to) setTo(tsDate(resolved.to));
  }, [resolved, initial.from, initial.to]);

  const input = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-base';
  return (
    <form
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3 print:hidden"
      onSubmit={(e) => {
        e.preventDefault();
        const p: Record<string, string> = { above, minMinutes, certainty };
        if (from) p.from = from;
        if (to) p.to = to;
        window.location.hash = href.search(p);
      }}
    >
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
        <label className="text-sm font-medium">
          {s.above}
          <input inputMode="decimal" value={above} onChange={(e) => setAbove(e.target.value)} className={input} required />
        </label>
        <label className="text-sm font-medium">
          {s.minMinutes}
          <input inputMode="numeric" value={minMinutes} onChange={(e) => setMinMinutes(e.target.value)} className={input} required />
        </label>
        <label className="text-sm font-medium">
          {s.from}
          <input type="date" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className={input} />
        </label>
        <label className="text-sm font-medium">
          {s.to}
          <input type="date" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className={input} />
        </label>
      </div>
      <fieldset>
        <legend className="text-sm font-medium">{s.certainty}</legend>
        <div className="mt-1 grid gap-2 sm:grid-cols-2">
          {(['possibly', 'certainly'] as const).map((c) => (
            <label key={c} className={`flex cursor-pointer gap-2 rounded-lg border-2 p-2 text-sm ${certainty === c ? 'border-slate-800' : 'border-slate-200'}`}>
              <input type="radio" name="certainty" value={c} checked={certainty === c} onChange={() => setCertainty(c)} className="mt-0.5" />
              <span>
                <span className="font-medium">{s[c]}</span>
                <span className="block text-xs text-slate-500">{c === 'possibly' ? s.possiblyHelp : s.certainlyHelp}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <button type="submit" className="w-full rounded-lg bg-slate-800 px-4 py-2 font-medium text-white sm:w-auto">
        {s.run}
      </button>
    </form>
  );
}

/**
 * D47: the results are also a printable document (same print styles as the reports): the query in words, then
 * every matching fridge with its excursions and coverage, or one sentence saying nothing matched and what was checked.
 */
function Results({ data }: { data: SearchResult }) {
  const s = strings.search;
  const f = strings.fridge;
  const q = data.query;
  const th = 'border-b border-slate-300 px-2 py-1.5 text-left font-semibold';
  const td = 'border-b border-slate-200 px-2 py-1.5 align-top';
  return (
    <article className="report rounded-lg border border-slate-200 bg-white p-4 print:border-0 print:p-0">
      <header className="border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{s.printTitle}</p>
          <button type="button" onClick={() => window.print()} className="rounded-lg border border-slate-800 px-3 py-1.5 text-sm font-medium print:hidden">
            {s.print}
          </button>
        </div>
        <p className="mt-1 font-medium">{s.query(q.above, q.minMinutes, q.from, q.to, q.certainty)}</p>
        <p className="mt-1 text-sm text-slate-600">{s.count(data.results.length, data.checked)}</p>
      </header>
      {data.results.length === 0 ? (
        <>
          <p className="mt-3">{s.noneSentence(q.above, q.minMinutes, q.from, q.to, data.checked)}</p>
          <p className="mt-1 text-sm text-slate-600 print:hidden">{s.none}</p>
        </>
      ) : (
        data.results.map(({ fridge, events, coverage }) => (
          <section key={fridge.id} className="mt-4 break-inside-avoid">
            <div className="flex flex-wrap items-baseline justify-between gap-x-2">
              <h3 className="font-semibold">
                <a href={href.fridge(fridge.id, { from: q.from, to: q.to })} className="underline decoration-slate-300 underline-offset-2 print:no-underline">
                  {fridge.branch} / {fridge.name}
                </a>
              </h3>
              <a href={href.report(fridge.id, { from: q.from, to: q.to })} className="text-sm text-slate-600 underline print:hidden">
                {s.report}
              </a>
            </div>
            <p className={`text-sm ${coverage < 100 ? 'font-medium text-amber-800' : 'text-slate-600'}`}>
              {s.coverage(coverage)} · {strings.dashboard.limit(fridge.maxTemp)}
            </p>
            {/* the table scrolls inside its own box on a phone; the page never scrolls sideways */}
            <div className="mt-1 overflow-x-auto">
              <table className="w-full min-w-[32rem] border-collapse text-sm print:min-w-0">
                <thead>
                  <tr>
                    <th className={th}>{strings.report.cols.when}</th>
                    <th className={th}>{strings.report.cols.duration}</th>
                    <th className={th}>{strings.report.cols.peak}</th>
                    <th className={th}>{strings.report.cols.kind}</th>
                  </tr>
                </thead>
                <tbody>
                  {events.map((e) => (
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
          </section>
        ))
      )}
    </article>
  );
}

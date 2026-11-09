import { useEffect, useState } from 'react';
import { api, errorMessage, type Certainty, type SearchQuery, type SearchResult } from '../api.ts';
import { strings } from '../strings.ts';
import { tsDate } from '../format.ts';
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
      <div>
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
      className="space-y-3 rounded-lg border border-slate-200 bg-white p-3"
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

function Results({ data }: { data: SearchResult }) {
  const s = strings.search;
  const f = strings.fridge;
  const q = data.query;
  return (
    <section>
      <p className="font-medium">{s.summary(data.results.length, q.above, q.minMinutes, q.from, q.to)}</p>
      {data.results.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{s.none}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {data.results.map(({ fridge, events }) => (
            <li key={fridge.id} className="rounded-lg border border-slate-200 bg-white p-3">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <a href={href.fridge(fridge.id, { from: q.from, to: q.to })} className="font-semibold underline decoration-slate-300 underline-offset-2">
                  {fridge.branch} / {fridge.name}
                </a>
                <a href={href.report(fridge.id, { from: q.from, to: q.to })} className="text-sm text-slate-600 underline">
                  {s.report}
                </a>
              </div>
              <ul className="mt-1 space-y-1 text-sm">
                {events.map((e) => (
                  <li key={e.firstHigh}>
                    <span className="font-medium">{f.eventClass[e.class]}</span> · {f.eventWhen(e)}: {f.eventDuration(e)}, {f.eventPeak(e.peak)}
                  </li>
                ))}
              </ul>
              {/* the search temperature can differ from the fridge's own limit; show both */}
              <p className="mt-1 text-xs text-slate-500">{strings.dashboard.limit(fridge.maxTemp)}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

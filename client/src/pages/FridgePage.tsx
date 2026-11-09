import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type EventView, type FridgeDetail, type Range } from '../api.ts';
import { strings } from '../strings.ts';
import { tsDate } from '../format.ts';
import { href } from '../router.ts';
import { StatusBadge } from '../components/Status.tsx';
import { TempChart } from '../components/fridge/TempChart.tsx';
import { LoggerUnit } from '../components/LoggerUnit.tsx';

const h3 = 'text-sm font-semibold uppercase tracking-wide text-slate-600';
const errorText = (e: unknown) => errorMessage(e, strings.common);

type State = { kind: 'loading' } | { kind: 'error'; message: string } | { kind: 'ok'; data: FridgeDetail };

export function FridgePage({ id, range }: { id: number; range: Partial<Range> }) {
  const [state, setState] = useState<State>({ kind: 'loading' });
  const load = useCallback(
    (quiet = false) => {
      if (!quiet) setState({ kind: 'loading' });
      api.fridge(id, range).then(
        (data) => setState({ kind: 'ok', data }),
        (e: unknown) => setState({ kind: 'error', message: errorText(e) }),
      );
    },
    // the range object is new on every hash change; its two strings are what matter
    [id, range.from, range.to],
  );
  useEffect(() => load(), [load]);

  const s = strings.fridge;
  return (
    <section className="space-y-5">
      <a href={href.dashboard} className="text-sm text-slate-600 underline underline-offset-2">
        {s.back}
      </a>
      {state.kind === 'loading' && <p className="text-slate-500">{strings.common.loading}</p>}
      {state.kind === 'error' && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {state.message}
        </p>
      )}
      {state.kind === 'ok' && <FridgeBody data={state.data} reload={() => load(true)} />}
    </section>
  );
}

function FridgeBody({ data, reload }: { data: FridgeDetail; reload: () => void }) {
  const s = strings.fridge;
  const f = data.fridge;
  const reasons = [...data.status.reasons].sort((a, b) => Number(a.level === 'info') - Number(b.level === 'info'));
  return (
    <>
      <header>
        <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{f.branch}</p>
        <div className="flex items-start justify-between gap-2">
          <h2 className="min-w-0 text-xl font-semibold">{f.name}</h2>
          <StatusBadge level={data.status.level} />
        </div>
        {data.asOf && (
          <p className="text-xs text-slate-500">
            {s.statusNow}: {s.statusNowHint(data.asOf)}
          </p>
        )}
        {reasons.length > 0 && (
          <ul className="mt-2 space-y-1 text-sm">
            {reasons.map((r, i) => (
              <li key={i} className={r.level === 'info' ? 'text-slate-500' : 'text-slate-800'}>
                {strings.reason(r, f.maxTemp)}
              </li>
            ))}
          </ul>
        )}
      </header>

      {data.range && <RangePicker id={f.id} range={data.range} />}

      {data.range && (
        <section>
          <h3 className={h3}>{s.chart}</h3>
          {data.readings.length === 0 ? (
            <p className="mt-2 rounded-lg border border-dashed border-slate-400 bg-white p-3 text-sm text-slate-700">{s.noReadings}</p>
          ) : (
            <div className="mt-2 rounded-lg border border-slate-200 bg-white p-2">
              <TempChart name={`${f.branch} / ${f.name}`} readings={data.readings} events={data.events} gaps={data.gaps} range={data.range} maxTemp={f.maxTemp} firstWarning={data.firstWarning} />
            </div>
          )}
          {data.firstWarning && <p className="mt-2 text-sm text-amber-900">{s.warning(data.firstWarning)}</p>}
        </section>
      )}

      <Events events={data.events} maxTemp={f.maxTemp} />
      <Quality data={data} />
      <Threshold id={f.id} maxTemp={f.maxTemp} onSaved={reload} />
      <LoggerHistory data={data} onChanged={reload} />
    </>
  );
}

function RangePicker({ id, range }: { id: number; range: Range }) {
  const s = strings.fridge;
  const [from, setFrom] = useState(tsDate(range.from));
  const [to, setTo] = useState(tsDate(range.to));
  const input = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-base';
  return (
    <section className="rounded-lg border border-slate-200 bg-white p-3">
      <form
        className="grid grid-cols-2 items-end gap-2 sm:grid-cols-[1fr_1fr_auto_auto]"
        onSubmit={(e) => {
          e.preventDefault();
          window.location.hash = href.fridge(id, { from, to });
        }}
      >
        <label className="text-sm font-medium">
          {s.from}
          <input type="date" value={from} max={to} onChange={(e) => setFrom(e.target.value)} className={input} required />
        </label>
        <label className="text-sm font-medium">
          {s.to}
          <input type="date" value={to} min={from} onChange={(e) => setTo(e.target.value)} className={input} required />
        </label>
        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-2 text-sm font-medium text-white">
          {s.show}
        </button>
        <a href={href.fridge(id)} className="py-2 text-center text-sm text-slate-600 underline">
          {s.last7}
        </a>
      </form>
      <div className="mt-2 flex flex-wrap items-center justify-between gap-2 text-sm">
        <span className="text-slate-600">{s.rangeShown(range.from, range.to)}</span>
        <a href={href.report(id, { from: range.from, to: range.to })} className="rounded-lg border border-slate-800 px-3 py-1.5 font-medium">
          {s.report}
        </a>
      </div>
    </section>
  );
}

const EVENT_STYLE: Record<EventView['class'], string> = {
  ongoing: 'border-l-8 border-red-600',
  sustained: 'border-l-8 border-red-600',
  unverified: 'border-l-8 border-amber-400',
  spike: 'border-l-8 border-slate-300',
};

function Events({ events, maxTemp }: { events: EventView[]; maxTemp: number }) {
  const s = strings.fridge;
  return (
    <section>
      <h3 className={h3}>
        {s.events} ({events.length})
      </h3>
      {events.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{s.eventsNone(maxTemp)}</p>
      ) : (
        <ul className="mt-2 space-y-2">
          {[...events].reverse().map((e) => (
            <li key={e.firstHigh} className={`rounded-lg bg-white p-3 text-sm shadow-sm ${EVENT_STYLE[e.class]}`}>
              <p className="font-semibold">
                {s.eventClass[e.class]} · {s.eventWhen(e)}
              </p>
              <p>
                {s.eventDuration(e)}, {s.eventPeak(e.peak)}
                {e.nextOk && !e.ongoing ? `; ${s.eventBackAt(e.nextOk)}` : ''}.
              </p>
              {e.errorsInside > 0 && <p className="text-slate-500">{s.eventErrors(e.errorsInside)}</p>}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

function Quality({ data }: { data: FridgeDetail }) {
  const s = strings.fridge;
  const q = data.quality;
  const cells: [string, number][] = [
    [s.qReadings, q.readings],
    [s.qErrors, q.errors],
    [s.qConflicts, q.conflicts],
    [s.qGaps, q.gaps],
  ];
  return (
    <section>
      <h3 className={h3}>{s.quality}</h3>
      <dl className="mt-2 grid grid-cols-4 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 text-center">
        {cells.map(([label, n]) => (
          <div key={label} className="bg-white px-1 py-2">
            <dt className="text-xs text-slate-500">{label}</dt>
            <dd className={`text-lg font-semibold ${n > 0 && label !== s.qReadings ? 'text-amber-800' : ''}`}>{n}</dd>
          </div>
        ))}
      </dl>
      <ul className="mt-2 space-y-1 text-sm text-slate-600">
        {Object.entries(q.typicalIntervalByLogger).map(([logger, min]) => (
          <li key={logger}>{s.qInterval(logger, min)}</li>
        ))}
        {data.gaps.map((g) => (
          <li key={g.from}>{s.gapLine(g.from, g.to, g.minutes)}</li>
        ))}
      </ul>
    </section>
  );
}

function Threshold({ id, maxTemp, onSaved }: { id: number; maxTemp: number; onSaved: () => void }) {
  const s = strings.fridge;
  const [value, setValue] = useState(maxTemp.toFixed(1));
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [saving, setSaving] = useState(false);
  useEffect(() => setValue(maxTemp.toFixed(1)), [maxTemp]);
  const save = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    try {
      await api.setMaxTemp(id, value); // the server parses "4,5" and checks the range (D34)
      setMessage({ ok: true, text: s.thresholdSaved });
      onSaved();
    } catch (err) {
      setMessage({ ok: false, text: errorText(err) });
    } finally {
      setSaving(false);
    }
  };
  return (
    <section>
      <h3 className={h3}>{s.threshold}</h3>
      <form onSubmit={save} className="mt-2 rounded-lg border border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-2">
          <label htmlFor={`max-${id}`} className="sr-only">
            {s.threshold}
          </label>
          <input
            id={`max-${id}`}
            inputMode="decimal"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setMessage(null);
            }}
            className="w-24 rounded border border-slate-300 px-2 py-1.5 text-base"
          />
          <span>{s.thresholdUnit}</span>
          <button type="submit" disabled={saving || value.trim() === maxTemp.toFixed(1)} className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white disabled:opacity-40">
            {s.thresholdSave}
          </button>
        </div>
        <p className="mt-1 text-xs text-slate-500">{s.thresholdHelp}</p>
        {message && (
          <p className={`mt-1 text-sm ${message.ok ? 'text-green-800' : 'text-red-800'}`} role="status">
            {message.text}
          </p>
        )}
      </form>
    </section>
  );
}

function LoggerHistory({ data, onChanged }: { data: FridgeDetail; onChanged: () => void }) {
  const s = strings.fridge;
  const periods = [...data.loggerHistory].sort((a, b) => (a.validFrom < b.validFrom ? 1 : -1)); // newest first
  return (
    <section>
      <h3 className={h3}>{s.loggers}</h3>
      {periods.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{s.loggersNone}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {periods.map((p) => (
            <li key={`${p.loggerId}-${p.validFrom}`} className="space-y-1 px-3 py-2.5">
              <p className="flex flex-wrap items-baseline gap-x-2">
                <span className="font-semibold">{p.loggerId}</span>
                {p.validTo === null && p.loggerId === data.currentLogger && <span className="rounded bg-slate-100 px-1.5 text-xs text-slate-600">{s.current}</span>}
                <span className="text-sm text-slate-600">{s.period(p.validFrom, p.validTo)}</span>
              </p>
              <LoggerUnit loggerId={p.loggerId} unit={p.unit} onChanged={onChanged} />
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}


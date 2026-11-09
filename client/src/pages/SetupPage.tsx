import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage, type BranchInfo, type LoggerInfo } from '../api.ts';
import { strings } from '../strings.ts';
import { href } from '../router.ts';
import { LoggerUnit } from '../components/LoggerUnit.tsx';

const h3 = 'text-sm font-semibold uppercase tracking-wide text-slate-600';
const input = 'mt-1 block w-full rounded border border-slate-300 bg-white px-2 py-1.5 text-base';
type Msg = { ok: boolean; text: string } | null;

function Message({ msg }: { msg: Msg }) {
  if (!msg) return null;
  return (
    <p className={`text-sm ${msg.ok ? 'text-green-800' : 'text-red-800'}`} role="status">
      {msg.text}
    </p>
  );
}

/** Setup (CRUD-lite, INIT Stage D): branches and fridges, add a fridge, move a logger, change a logger's unit. */
export function SetupPage() {
  const s = strings.setup;
  const [branches, setBranches] = useState<BranchInfo[] | null>(null);
  const [loggers, setLoggers] = useState<LoggerInfo[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    Promise.all([api.branches(), api.loggers()]).then(
      ([b, l]) => {
        setBranches(b);
        setLoggers(l);
        setError(null);
      },
      (e: unknown) => setError(errorMessage(e, strings.common)),
    );
  }, []);
  useEffect(load, [load]);

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{s.title}</h2>
        <p className="text-sm text-slate-600">{s.intro}</p>
      </div>
      {error && (
        <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}
      {!branches || !loggers ? (
        !error && <p className="text-slate-500">{strings.common.loading}</p>
      ) : (
        <>
          <Branches branches={branches} />
          <div className="grid gap-3 sm:grid-cols-2">
            <AddBranch onAdded={load} />
            <AddFridge branches={branches} onAdded={load} />
          </div>
          <Loggers loggers={loggers} branches={branches} onChanged={load} />
        </>
      )}
    </section>
  );
}

function Branches({ branches }: { branches: BranchInfo[] }) {
  const s = strings.setup;
  return (
    <section>
      <h3 className={h3}>{s.branches}</h3>
      <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
        {branches.map((b) => (
          <details key={b.id} className="group">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
              <span className="font-medium">{b.name}</span>
              <span className="flex items-center gap-2 text-sm text-slate-500">
                {s.fridgeCount(b.fridges.length)}
                <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
              </span>
            </summary>
            <ul className="border-t border-slate-100 bg-slate-50 px-3 py-1 text-sm">
              {b.fridges.map((f) => (
                <li key={f.id} className="flex flex-wrap items-baseline justify-between gap-x-2 py-1">
                  <a href={href.fridge(f.id)} className="underline decoration-slate-300 underline-offset-2">
                    {f.name}
                  </a>
                  <span className="text-slate-500">
                    {f.currentLogger ?? <span className="italic">{s.noLogger}</span>} · {s.limit(f.maxTemp)}
                  </span>
                </li>
              ))}
            </ul>
          </details>
        ))}
      </div>
    </section>
  );
}

function AddBranch({ onAdded }: { onAdded: () => void }) {
  const s = strings.setup;
  const [name, setName] = useState('');
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const r = await api.createBranch(name);
          setMsg({ ok: true, text: s.branchAdded(r.name, r.created) });
          setName('');
          onAdded();
        } catch (err) {
          setMsg({ ok: false, text: errorMessage(err, strings.common) });
        }
      }}
    >
      <p className="font-semibold">{s.addBranch}</p>
      <label className="block text-sm font-medium">
        {s.branchName}
        <input value={name} onChange={(e) => setName(e.target.value)} className={input} required />
      </label>
      <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white">
        {s.add}
      </button>
      <Message msg={msg} />
    </form>
  );
}

function AddFridge({ branches, onAdded }: { branches: BranchInfo[]; onAdded: () => void }) {
  const s = strings.setup;
  const [branchId, setBranchId] = useState('');
  const [name, setName] = useState('');
  const [maxTemp, setMaxTemp] = useState('5.0');
  const [msg, setMsg] = useState<Msg>(null);
  return (
    <form
      className="space-y-2 rounded-lg border border-slate-200 bg-white p-3"
      onSubmit={async (e) => {
        e.preventDefault();
        try {
          const f = await api.createFridge({ branchId: Number(branchId), name, maxTemp });
          setMsg({ ok: true, text: s.fridgeAdded(f.branch, f.name) });
          setName('');
          onAdded();
        } catch (err) {
          setMsg({ ok: false, text: errorMessage(err, strings.common) }); // e.g. "Haifa already has a fridge called ..."
        }
      }}
    >
      <p className="font-semibold">{s.addFridge}</p>
      <label className="block text-sm font-medium">
        {s.branch}
        <select value={branchId} onChange={(e) => setBranchId(e.target.value)} className={input} required>
          <option value="">{s.choose}</option>
          {branches.map((b) => (
            <option key={b.id} value={b.id}>
              {b.name}
            </option>
          ))}
        </select>
      </label>
      <div className="grid grid-cols-[2fr_1fr] gap-2">
        <label className="text-sm font-medium">
          {s.fridgeName}
          <input value={name} onChange={(e) => setName(e.target.value)} className={input} required />
        </label>
        <label className="text-sm font-medium">
          {s.fridgeLimit}
          <input inputMode="decimal" value={maxTemp} onChange={(e) => setMaxTemp(e.target.value)} className={input} />
        </label>
      </div>
      <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white">
        {s.add}
      </button>
      <Message msg={msg} />
    </form>
  );
}

function Loggers({ loggers, branches, onChanged }: { loggers: LoggerInfo[]; branches: BranchInfo[]; onChanged: () => void }) {
  const s = strings.setup;
  // default "from" for a move: the latest reading of any logger (the dashboard's "now", D22), not the wall clock
  const latest = loggers.reduce<string | null>((a, l) => (l.lastReading && (!a || l.lastReading > a) ? l.lastReading : a), null);
  return (
    <section>
      <h3 className={h3}>{s.loggers}</h3>
      {loggers.length === 0 ? (
        <p className="mt-2 text-sm text-slate-600">{s.loggersNone}</p>
      ) : (
        <ul className="mt-2 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
          {loggers.map((l) => (
            <LoggerRow key={l.id} logger={l} branches={branches} defaultFrom={latest} onChanged={onChanged} />
          ))}
        </ul>
      )}
    </section>
  );
}

function LoggerRow({ logger, branches, defaultFrom, onChanged }: { logger: LoggerInfo; branches: BranchInfo[]; defaultFrom: string | null; onChanged: () => void }) {
  const s = strings.setup;
  const [moving, setMoving] = useState(false);
  const [fridgeId, setFridgeId] = useState('');
  const [from, setFrom] = useState(defaultFrom ?? '');
  const [msg, setMsg] = useState<Msg>(null);
  const label = (id: number) => {
    for (const b of branches) for (const f of b.fridges) if (f.id === id) return `${b.name} / ${f.name}`;
    return String(id);
  };
  return (
    <li className="space-y-1 px-3 py-2.5">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-semibold">{logger.id}</span>
        <span className="text-sm text-slate-500">{s.loggerStats(logger.readings, logger.lastReading)}</span>
      </div>
      <p className="text-sm text-slate-700">{s.loggerWhere(logger.currentFridge?.label ?? null, logger.currentFridge?.since ?? '')}</p>
      <div className="flex flex-wrap items-start gap-x-4 gap-y-1">
        <LoggerUnit loggerId={logger.id} unit={logger.unit} onChanged={onChanged} />
        {!moving && (
          <button type="button" onClick={() => (setMoving(true), setMsg(null))} className="text-sm text-slate-700 underline underline-offset-2">
            {s.move}
          </button>
        )}
      </div>
      {moving && (
        <form
          className="mt-2 space-y-2 rounded-lg border border-slate-300 bg-slate-50 p-3"
          onSubmit={async (e) => {
            e.preventDefault();
            try {
              await api.moveLogger(logger.id, { fridgeId: Number(fridgeId), from });
              setMsg({ ok: true, text: s.moved(logger.id, label(Number(fridgeId))) });
              setMoving(false);
              onChanged();
            } catch (err) {
              setMsg({ ok: false, text: errorMessage(err, strings.common) }); // 409: the fridge already has a logger (D33)
            }
          }}
        >
          <p className="font-semibold">{s.moveTitle(logger.id)}</p>
          <div className="grid gap-2 sm:grid-cols-2">
            <label className="text-sm font-medium">
              {s.moveTo}
              <select value={fridgeId} onChange={(e) => setFridgeId(e.target.value)} className={input} required>
                <option value="">{s.choose}</option>
                {branches.map((b) => (
                  <optgroup key={b.id} label={b.name}>
                    {b.fridges.map((f) => (
                      <option key={f.id} value={f.id} disabled={f.id === logger.currentFridge?.id}>
                        {b.name} / {f.name}
                        {f.currentLogger && f.currentLogger !== logger.id ? ` (${f.currentLogger})` : ''}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium">
              {s.moveFrom}
              <input type="datetime-local" value={from} onChange={(e) => setFrom(e.target.value)} className={input} required />
            </label>
          </div>
          <p className="text-xs text-slate-500">{s.moveHelp}</p>
          <div className="flex gap-2">
            <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white">
              {s.moveSave}
            </button>
            <button type="button" onClick={() => setMoving(false)} className="rounded-lg border border-slate-400 px-3 py-1.5 text-sm font-medium">
              {s.cancel}
            </button>
          </div>
        </form>
      )}
      <Message msg={msg} />
    </li>
  );
}

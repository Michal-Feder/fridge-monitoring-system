import { useState } from 'react';
import type { BranchInfo, FileSummary, LoggerSummary, Unit } from '../../api.ts';
import { strings } from '../../strings.ts';
import { keepUnits } from '../../format.ts';

/** D3: the system suggests, a human picks. No unit is pre-selected, so saving always needs a deliberate choice. */
export function UnitDecision({ logger, chosen, onChoose }: { logger: LoggerSummary; chosen: Unit | undefined; onChoose: (u: Unit) => void }) {
  const s = strings.upload;
  const sug = logger.suggestion;
  if (sug.unit === null) {
    // D42: neither unit fits; offering °C / °F here would invite a wrong guess, so the file has to be fixed
    return (
      <div className="rounded-lg border-2 border-red-500 bg-red-50 p-3" role="alert">
        <p className="font-semibold text-red-900">{s.unitNoFit(logger.loggerId)}</p>
        {logger.fridges.length > 0 && <p className="text-sm text-slate-600">{s.loggerIn(logger.fridges)}</p>}
        <p className="mt-1 text-sm text-red-900">{keepUnits(sug.reason)}</p>
        <p className="mt-1 text-xs text-slate-600">{s.unitNoFitHelp}</p>
      </div>
    );
  }
  return (
    <fieldset className={`rounded-lg border-2 bg-white p-3 ${chosen ? 'border-slate-200' : 'border-amber-400'}`}>
      <legend className="px-1 font-semibold">
        {s.unitTitle(logger.loggerId)} {!logger.known && <span className="ml-1 rounded bg-slate-100 px-1.5 py-0.5 text-xs font-medium text-slate-600">{s.newLogger}</span>}
      </legend>
      {logger.fridges.length > 0 && <p className="text-sm text-slate-600">{s.loggerIn(logger.fridges)}</p>}
      <p className="mt-1 text-sm">{keepUnits(sug.reason)}</p>
      {sug.confidence === 'low' && <p className="mt-1 text-sm font-medium text-amber-800">{s.lowConfidence}</p>}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(['C', 'F'] as const).map((u) => (
          <button
            key={u}
            type="button"
            aria-pressed={chosen === u}
            onClick={() => onChoose(u)}
            className={`flex flex-col items-center rounded-lg border-2 px-2 py-2 text-sm font-semibold ${chosen === u ? 'border-slate-800 bg-slate-800 text-white' : 'border-slate-300 bg-white text-slate-800'}`}
          >
            {u === 'C' ? s.celsius : s.fahrenheit}
            {sug.unit === u && <span className={`text-xs font-medium ${chosen === u ? 'text-slate-200' : 'text-slate-500'}`}>{s.suggested}</span>}
          </button>
        ))}
      </div>
      <p className="mt-2 text-xs text-slate-500">{chosen ? s.unitChosen(chosen) : s.unitHelp}</p>
    </fieldset>
  );
}

type RawDecision = { loggerId?: string; branch?: string; fridge?: string };

/** D25/D26: a raw logger file needs a logger id (if not in the file name) and the fridge it hangs in. */
export function AssignDecision({
  file,
  branches,
  current,
  onApply,
}: {
  file: FileSummary;
  branches: BranchInfo[];
  current: RawDecision | undefined;
  onApply: (d: RawDecision) => void;
}) {
  const s = strings.upload;
  const raw = file.raw!;
  const askLogger = raw.loggerIdSource !== 'column' && raw.loggerIdSource !== 'filename';
  const [loggerId, setLoggerId] = useState(current?.loggerId ?? raw.loggerId ?? '');
  const [branch, setBranch] = useState(current?.branch ?? raw.branch ?? '');
  const [fridge, setFridge] = useState(current?.fridge ?? raw.fridge ?? '');
  const [missing, setMissing] = useState(false);
  const fridgeOptions = branches.find((b) => b.name.toLowerCase() === branch.trim().toLowerCase())?.fridges ?? [];
  const id = (k: string) => `${file.name}-${k}`;

  const apply = (e: React.FormEvent) => {
    e.preventDefault();
    if ((askLogger && !loggerId.trim()) || !branch.trim() || !fridge.trim()) return setMissing(true);
    setMissing(false);
    onApply({ ...(askLogger ? { loggerId: loggerId.trim() } : {}), branch: branch.trim(), fridge: fridge.trim() });
  };

  const input = 'mt-1 block w-full rounded border border-slate-300 px-2 py-1.5 text-base';
  return (
    <form onSubmit={apply} className={`rounded-lg border-2 bg-white p-3 ${raw.needsAssignment ? 'border-amber-400' : 'border-slate-200'}`}>
      <p className="break-words font-semibold">{s.assignTitle(file.name)}</p>
      <p className="text-sm text-slate-600">{s.assignHelp}</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-3">
        {askLogger && (
          <label htmlFor={id('logger')} className="text-sm font-medium">
            {s.loggerId}
            <input id={id('logger')} value={loggerId} onChange={(e) => setLoggerId(e.target.value)} placeholder={s.loggerIdPlaceholder} className={input} autoCapitalize="characters" />
          </label>
        )}
        <label htmlFor={id('branch')} className="text-sm font-medium">
          {s.branch}
          <input id={id('branch')} list={id('branches')} value={branch} onChange={(e) => setBranch(e.target.value)} className={input} />
          <datalist id={id('branches')}>
            {branches.map((b) => (
              <option key={b.id} value={b.name} />
            ))}
          </datalist>
        </label>
        <label htmlFor={id('fridge')} className="text-sm font-medium">
          {s.fridge}
          <input id={id('fridge')} list={id('fridges')} value={fridge} onChange={(e) => setFridge(e.target.value)} className={input} />
          <datalist id={id('fridges')}>
            {fridgeOptions.map((f) => (
              <option key={f.id} value={f.name} />
            ))}
          </datalist>
        </label>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <button type="submit" className="rounded-lg bg-slate-800 px-3 py-1.5 text-sm font-medium text-white">
          {s.assignApply}
        </button>
        {missing && <span className="text-sm text-red-700">{s.assignMissing}</span>}
        {!missing && !raw.needsAssignment && raw.branch && raw.fridge && <span className="text-sm text-slate-600">{s.assignChosen(raw.branch, raw.fridge)}</span>}
      </div>
    </form>
  );
}

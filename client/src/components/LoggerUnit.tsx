import { useState } from 'react';
import { api, errorMessage, type Unit } from '../api.ts';
import { strings } from '../strings.ts';

/**
 * A logger's unit with a "Change unit" control (D3, D4). Two steps: pick the other unit, then confirm a
 * message that says every reading of the logger is recomputed from the stored originals. Used on the
 * fridge page (logger history) and in Setup.
 */
export function LoggerUnit({ loggerId, unit, onChanged }: { loggerId: string; unit: Unit | null; onChanged: () => void }) {
  const s = strings.loggerUnit;
  const [step, setStep] = useState<'idle' | 'confirm' | 'working'>('idle');
  const [count, setCount] = useState<number | null>(null);
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const target: Unit = unit === 'F' ? 'C' : 'F';

  const open = () => {
    setMessage(null);
    setStep('confirm');
    setCount(null);
    // how many readings will change: shown in the confirm text when it arrives, not needed to confirm
    api.loggers().then((list) => setCount(list.find((l) => l.id === loggerId)?.readings ?? null), () => setCount(null));
  };

  const change = async () => {
    setStep('working');
    try {
      const r = await api.setLoggerUnit(loggerId, target);
      setMessage({ ok: true, text: s.done(r.recomputed, r.unit) });
      setStep('idle');
      onChanged();
    } catch (e) {
      setMessage({ ok: false, text: errorMessage(e, strings.common) });
      setStep('idle');
    }
  };

  return (
    <div className="text-sm">
      <div className="flex flex-wrap items-center gap-2">
        <span className="rounded border border-slate-300 bg-white px-1.5 py-0.5 font-semibold" aria-label={`unit ${s.unit(unit)}`}>
          {s.unit(unit)}
        </span>
        {step === 'idle' && unit && (
          <button type="button" onClick={open} className="text-slate-700 underline underline-offset-2 print:hidden">
            {s.change}
          </button>
        )}
      </div>
      {step !== 'idle' && unit && (
        <div role="alertdialog" aria-labelledby={`unit-${loggerId}`} className="mt-2 rounded-lg border-2 border-amber-400 bg-amber-50 p-3">
          <p id={`unit-${loggerId}`} className="font-semibold">
            {s.confirmTitle(loggerId, unit, target)}
          </p>
          <p className="mt-1 text-slate-700">{s.confirmBody(count)}</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <button type="button" onClick={change} disabled={step === 'working'} className="rounded-lg bg-slate-800 px-3 py-1.5 font-medium text-white disabled:opacity-60">
              {step === 'working' ? s.working : s.confirmYes(target)}
            </button>
            <button type="button" onClick={() => setStep('idle')} disabled={step === 'working'} className="rounded-lg border border-slate-400 px-3 py-1.5 font-medium">
              {s.cancel}
            </button>
          </div>
        </div>
      )}
      {message && (
        <p className={`mt-1 ${message.ok ? 'text-green-800' : 'text-red-800'}`} role="status">
          {message.text}
        </p>
      )}
    </div>
  );
}

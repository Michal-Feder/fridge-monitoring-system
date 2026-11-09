import type { DashboardFridge, Level } from '../api.ts';
import { strings } from '../strings.ts';
import { StatusBadge } from './Status.tsx';

const CARD: Record<Level, string> = {
  red: 'border-l-8 border-red-600 bg-white',
  // outline only: it was too warm earlier in the period and is back to normal now (D36)
  was_red: 'border-2 border-red-600 bg-white',
  orange: 'border-l-8 border-amber-400 bg-white',
  // dashed + striped: "no data" must never look like "fine" (CLAUDE.md, D11)
  grey: 'border-2 border-dashed border-slate-400 no-data-stripes',
  green: 'border-l-8 border-green-600 bg-white',
};

export function FridgeCard({ fridge }: { fridge: DashboardFridge }) {
  const s = strings.dashboard;
  // the colour-giving reasons first, info (spikes, conflicts) after
  const reasons = [...fridge.reasons].sort((a, b) => Number(a.level === 'info') - Number(b.level === 'info'));
  return (
    <article className={`rounded-lg p-3 shadow-sm ${CARD[fridge.level]}`} aria-label={`${fridge.branch} / ${fridge.name}: ${strings.level[fridge.level]}`}>
      <header className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs font-medium uppercase tracking-wide text-slate-500">{fridge.branch}</p>
          <h3 className="truncate text-base font-semibold">{fridge.name}</h3>
        </div>
        <StatusBadge level={fridge.level} />
      </header>
      {reasons.length > 0 && (
        <ul className="mt-2 space-y-1 text-sm">
          {reasons.map((r, i) => (
            <li key={i} className={r.level === 'info' ? 'text-slate-500' : 'text-slate-800'}>
              {strings.reason(r, fridge.maxTemp)}
            </li>
          ))}
        </ul>
      )}
      <p className="mt-2 text-xs text-slate-500">
        {fridge.lastReading ? s.lastReading(fridge.lastReading.tempC, fridge.lastReading.ts) : s.noReading}
        {' · '}
        {s.limit(fridge.maxTemp)}
      </p>
    </article>
  );
}

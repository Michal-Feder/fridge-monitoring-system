import { CartesianGrid, ComposedChart, Line, ReferenceArea, ReferenceLine, ResponsiveContainer, Scatter, Tooltip, XAxis, YAxis } from 'recharts';
import type { ChartReading, EventClass, EventView, GapView, Range } from '../../api.ts';
import { strings } from '../../strings.ts';
import { fmtMinutesTs, fmtTemp, tsToMinutes } from '../../format.ts';

// Tailwind palette values: SVG attributes cannot take utility classes.
const C = { line: '#1e293b', red: '#dc2626', amber: '#d97706', amberFill: '#fbbf24', gap: '#94a3b8', grid: '#e2e8f0', axis: '#64748b' };
const BAND: Record<EventClass, { fill: string; opacity: number }> = {
  ongoing: { fill: C.red, opacity: 0.18 },
  sustained: { fill: C.red, opacity: 0.18 },
  unverified: { fill: C.amberFill, opacity: 0.3 },
  spike: { fill: C.red, opacity: 0.07 },
};

interface Point {
  t: number;
  /** null breaks the line: error reading, or the start of a gap (never filled in, CLAUDE.md) */
  temp: number | null;
  /** y position of an error mark (bottom of the chart), only on error readings */
  errY?: number;
  original?: string;
  unit?: string;
  conflict?: boolean;
  error?: boolean;
}

function buildPoints(readings: ChartReading[], gaps: GapView[], errY: number): Point[] {
  const byTs = new Map<string, ChartReading[]>();
  for (const r of readings) byTs.set(r.ts, [...(byTs.get(r.ts) ?? []), r]);
  const pts: Point[] = [];
  for (const [ts, rs] of byTs) {
    const nums = rs.filter((r) => r.tempC !== null);
    if (nums.length === 0) {
      pts.push({ t: tsToMinutes(ts), temp: null, errY, original: rs[0].originalValue, error: true });
      continue;
    }
    // D24: two values at one time -> the higher one counts
    const top = nums.reduce((a, b) => ((b.tempC as number) > (a.tempC as number) ? b : a));
    pts.push({ t: tsToMinutes(ts), temp: top.tempC, original: top.originalValue, unit: top.originalUnit, conflict: nums.length > 1 || rs.some((r) => r.status === 'conflict') });
  }
  // one empty point just inside every gap, so the line stops instead of bridging the missing hours
  for (const g of gaps) pts.push({ t: tsToMinutes(g.from) + 1, temp: null });
  return pts.sort((a, b) => a.t - b.t);
}

/** Ticks on round times: midnights for long periods, every 1/2/3/6/12 h for short ones; at most ~5. */
function niceTicks(x0: number, x1: number): number[] {
  const span = x1 - x0;
  const steps = [60, 120, 180, 360, 720, 1440, 2880, 4320, 10080];
  const step = steps.find((s) => span / s <= 5) ?? 10080;
  const out: number[] = [];
  for (let t = Math.ceil(x0 / step) * step; t <= x1; t += step) out.push(t);
  return out;
}

function ChartTooltip({ active, payload }: { active?: boolean; payload?: { payload: Point }[] }) {
  const p = payload?.[0]?.payload;
  if (!active || !p || (p.temp === null && !p.error)) return null;
  const s = strings.fridge;
  return (
    <div className="rounded border border-slate-300 bg-white px-2 py-1 text-xs shadow">
      <p className="font-medium">{fmtMinutesTs(p.t)}</p>
      {p.error ? (
        <p className="text-red-700">{s.tooltipError(p.original ?? '')}</p>
      ) : (
        <>
          <p>{fmtTemp(p.temp)}</p>
          {p.unit === 'F' && <p className="text-slate-500">{s.tooltipOriginal(p.original ?? '', 'F')}</p>}
          {p.conflict && <p className="text-amber-800">{s.tooltipConflict}</p>}
        </>
      )}
    </div>
  );
}

/** In a ComposedChart the Scatter gets every point of the shared data, so non-error points draw nothing. */
function ErrorMark({ cx, cy, payload }: { cx?: number; cy?: number; payload?: Point }) {
  if (!payload?.error || cx === undefined || cy === undefined) return null;
  return <path d={`M${cx - 4},${cy - 4}L${cx + 4},${cy + 4}M${cx + 4},${cy - 4}L${cx - 4},${cy + 4}`} stroke={C.red} strokeWidth={2} />;
}

export function TempChart(props: { name: string; readings: ChartReading[]; events: EventView[]; gaps: GapView[]; range: Range; maxTemp: number; firstWarning: string | null }) {
  const { readings, events, gaps, range, maxTemp, firstWarning } = props;
  const s = strings.fridge;
  const temps = readings.map((r) => r.tempC).filter((t): t is number => t !== null);
  const yMin = Math.floor(Math.min(maxTemp, ...temps) - 1);
  const yMax = Math.ceil(Math.max(maxTemp, ...temps) + 1);
  const points = buildPoints(readings, gaps, yMin + 0.3);
  const x0 = tsToMinutes(range.from);
  const x1 = tsToMinutes(range.to);
  const clampX = (ts: string) => Math.min(Math.max(tsToMinutes(ts), x0), x1);
  const realPoints = points.filter((p) => p.temp !== null || p.error).length;
  const ticks = niceTicks(x0, x1);
  const dayTicks = x1 - x0 > 2 * 1440;

  return (
    <figure>
      <div role="img" aria-label={s.chartLabel(props.name)} className="h-60 w-full sm:h-72">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: -18 }}>
            <CartesianGrid stroke={C.grid} vertical={false} />
            <XAxis
              dataKey="t"
              type="number"
              domain={[x0, x1]}
              allowDataOverflow
              ticks={ticks}
              // day ticks show the date ("14 Sep"), hour ticks the time ("06:00"); the period is printed above
              tickFormatter={(t: number) => fmtMinutesTs(t).split(' ')[dayTicks ? 0 : 1]}
              minTickGap={8}
              tick={{ fontSize: 11, fill: C.axis }}
              stroke={C.axis}
            />
            <YAxis domain={[yMin, yMax]} allowDecimals={false} tick={{ fontSize: 11, fill: C.axis }} stroke={C.axis} width={44} unit="°" />
            {gaps.map((g) => (
              <ReferenceArea key={`g-${g.from}`} x1={clampX(g.from)} x2={clampX(g.to)} fill={C.gap} fillOpacity={0.3} ifOverflow="hidden" />
            ))}
            {events.map((e) => (
              <ReferenceArea
                key={`e-${e.firstHigh}`}
                x1={clampX(e.prevOk ?? e.firstHigh)}
                x2={clampX(e.nextOk ?? e.lastHigh)}
                fill={BAND[e.class].fill}
                fillOpacity={BAND[e.class].opacity}
                ifOverflow="hidden"
              />
            ))}
            <ReferenceLine y={maxTemp} stroke={C.red} strokeDasharray="6 4" label={{ value: s.limitLabel(maxTemp), position: 'insideTopLeft', fill: C.red, fontSize: 11 }} />
            {/* left, not right: a rising line crosses the limit at the right end, where the label used to sit */}
            {firstWarning && (
              <ReferenceLine x={clampX(firstWarning)} stroke={C.amber} strokeWidth={2} label={{ value: s.warningLabel, position: 'insideTopLeft', fill: C.amber, fontSize: 11 }} />
            )}
            <Tooltip content={<ChartTooltip />} />
            <Line dataKey="temp" stroke={C.line} strokeWidth={2} connectNulls={false} isAnimationActive={false} dot={realPoints <= 60 ? { r: 2.5, fill: C.line } : false} activeDot={{ r: 4 }} />
            <Scatter dataKey="errY" shape={<ErrorMark />} isAnimationActive={false} />
          </ComposedChart>
        </ResponsiveContainer>
      </div>
      <figcaption>
        <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
          <li className="flex items-center gap-1.5">
            <span className="h-0.5 w-4 bg-slate-800" aria-hidden />
            {s.legend.temp}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="w-4 border-t-2 border-dashed border-red-600" aria-hidden />
            {s.legend.limit}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-4 bg-red-600/20" aria-hidden />
            {s.legend.excursion}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-4 bg-amber-400/40" aria-hidden />
            {s.legend.unverified}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="h-3 w-4 bg-slate-400/40" aria-hidden />
            {s.legend.gap}
          </li>
          <li className="flex items-center gap-1.5">
            <span className="font-bold leading-none text-red-600" aria-hidden>
              ×
            </span>
            {s.legend.error}
          </li>
          {firstWarning && (
            <li className="flex items-center gap-1.5">
              <span className="h-3 w-0.5 bg-amber-600" aria-hidden />
              {s.legend.warning}
            </li>
          )}
        </ul>
      </figcaption>
    </figure>
  );
}

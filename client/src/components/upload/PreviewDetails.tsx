import type { ConfirmResult, FileSummary, LoggerSummary, PreviewResult, PreviewTotals } from '../../api.ts';
import { strings } from '../../strings.ts';
import { href } from '../../router.ts';
import { keepUnits } from '../../format.ts';

const h3 = 'text-sm font-semibold uppercase tracking-wide text-slate-600';

export function Totals({ totals }: { totals: PreviewTotals }) {
  const s = strings.upload;
  const keys = Object.keys(s.totals) as (keyof PreviewTotals)[];
  // the numbers Summer must look at are emphasised; zero is shown too, so "0 conflicts" is visibly checked
  const strong: (keyof PreviewTotals)[] = ['newRows', 'conflicts', 'errorReadings', 'skipped'];
  return (
    <section>
      <h3 className={h3}>{s.summary}</h3>
      <dl className="mt-2 grid grid-cols-2 gap-px overflow-hidden rounded-lg border border-slate-200 bg-slate-200 sm:grid-cols-4">
        {keys.map((k) => (
          // 7 cells: the last spans two columns, so neither the 2- nor the 4-column grid leaves an empty grey hole
          <div key={k} className="bg-white px-3 py-2 last:col-span-2">
            <dt className="text-xs text-slate-500">{s.totals[k]}</dt>
            <dd className={`text-lg font-semibold ${strong.includes(k) && totals[k] > 0 && k !== 'newRows' ? 'text-amber-800' : ''}`}>{totals[k]}</dd>
          </div>
        ))}
      </dl>
      <p className="mt-1 text-xs text-slate-500">{s.totalsHint}</p>
    </section>
  );
}

/** Non-blocking things to check: file errors and warnings, D28 unit warnings, and what will be created (D27). */
export function Checks({ preview }: { preview: PreviewResult }) {
  const s = strings.upload;
  const items = [
    ...preview.files.filter((f) => !f.ok).map((f) => ({ key: `e-${f.name}`, error: true, text: `${f.name}: ${f.error ?? s.fileError}` })),
    ...preview.files.flatMap((f) => f.warnings.map((w, i) => ({ key: `w-${f.name}-${i}`, error: false, text: `${f.name}: ${w}` }))),
    ...preview.loggers.filter((l) => l.unitWarning).map((l) => ({ key: `u-${l.loggerId}`, error: false, text: l.unitWarning! })),
  ];
  const created = [...preview.newBranches.map(s.newBranch), ...preview.newFridges.map(s.newFridge)];
  if (!items.length && !created.length) return null;
  return (
    <section className="space-y-3">
      {items.length > 0 && (
        <div>
          <h3 className={h3}>{s.warnings}</h3>
          <ul className="mt-2 space-y-1.5">
            {items.map((i) => (
              <li key={i.key} className={`break-words rounded-lg border p-2 text-sm ${i.error ? 'border-red-300 bg-red-50 text-red-900' : 'border-amber-300 bg-amber-50 text-amber-950'}`}>
                {keepUnits(i.text)}
              </li>
            ))}
          </ul>
        </div>
      )}
      {created.length > 0 && (
        <div>
          <h3 className={h3}>{s.willCreate}</h3>
          <ul className="mt-2 flex flex-wrap gap-2">
            {created.map((c) => (
              <li key={c} className="rounded-full border border-slate-300 bg-white px-3 py-1 text-sm">
                {c}
              </li>
            ))}
          </ul>
          <p className="mt-1 text-xs text-slate-500">{s.willCreateHint}</p>
        </div>
      )}
    </section>
  );
}

function FileDetails({ file }: { file: FileSummary }) {
  const s = strings.upload;
  return (
    <details className="group">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 px-3 py-2.5">
        <span className="min-w-0 truncate font-medium">{file.name}</span>
        <span className="flex shrink-0 items-center gap-2 text-sm text-slate-500">
          {file.ok ? (
            <>
              <span className="rounded bg-slate-100 px-1.5 text-xs">{s.modeShort[file.mode]}</span>
              {s.fileNew(file.newRows)}
            </>
          ) : (
            <span className="font-medium text-red-700">{s.fileError}</span>
          )}
          <span aria-hidden className="transition-transform group-open:rotate-90">›</span>
        </span>
      </summary>
      <div className="space-y-2 border-t border-slate-100 bg-slate-50 px-3 py-2 text-sm">
        {file.ok ? (
          <>
            <p>{s.mode[file.mode]}</p>
            <p>
              <span className="text-slate-500">{s.columns}: </span>
              {file.columns.map((c) => s.columnAt(s.column[c.field], c.index, c.label)).join(', ')}
            </p>
            {!file.hasHeader && <p className="text-slate-600">{s.noHeader}</p>}
            <p>
              <span className="text-slate-500">{s.dateFormat}: </span>
              {s.dates(file.dateFormat)}
            </p>
            {file.raw && (
              <p>
                {s.rawLogger(file.raw.loggerId, file.raw.loggerIdSource)}
                {file.raw.branch && file.raw.fridge && ` · ${file.raw.branch} / ${file.raw.fridge} ${s.rawFrom(file.raw.fridgeSource)}`}
              </p>
            )}
            <p className="text-slate-600">
              {s.rows(file.rowsRead)} · {s.totals.newRows.toLowerCase()} {file.newRows} · {s.totals.alreadyInDb.toLowerCase()} {file.alreadyInDb} · {s.totals.exactDuplicates.toLowerCase()} {file.exactDuplicates} · {s.totals.conflicts.toLowerCase()} {file.conflicts} · {s.totals.errorReadings.toLowerCase()} {file.errorReadings}
            </p>
          </>
        ) : (
          <p className="text-red-800">{file.error}</p>
        )}
        {file.issues.length > 0 && (
          <div>
            <p className="text-slate-500">{s.issues}</p>
            <ul className="list-inside list-disc">
              {file.issues.map((i) => (
                <li key={`${i.lineNo}-${i.kind}`} className="break-words">
                  {s.issueLine(i.lineNo, i.detail)}
                </li>
              ))}
            </ul>
            {file.skipped > file.issues.length && <p className="text-slate-500">{s.moreIssues(file.skipped - file.issues.length)}</p>}
          </div>
        )}
      </div>
    </details>
  );
}

function LoggerDetails({ logger }: { logger: LoggerSummary }) {
  const s = strings.upload;
  return (
    <li className="px-3 py-2.5 text-sm">
      <div className="flex flex-wrap items-baseline justify-between gap-x-2">
        <span className="font-medium">
          {logger.loggerId}
          {!logger.known && <span className="ml-1 text-xs font-normal text-slate-500">({s.newLogger})</span>}
        </span>
        <span className="text-slate-500">
          {s.rows(logger.rows)} · {s.interval(logger.typicalInterval)}
        </span>
      </div>
      <p className="text-slate-600">
        {s.loggerRange(logger.firstTs, logger.lastTs)} · {logger.fridges.join(', ')}
      </p>
      {logger.moves.length > 0 && (
        <ul className="mt-1 text-slate-700">
          {logger.moves.map((mv) => (
            <li key={mv.at} className="flex items-start gap-1">
              <span aria-hidden>→</span>
              {s.moveLine(mv.to, mv.at)}
            </li>
          ))}
        </ul>
      )}
      {logger.gaps.length > 0 && (
        <div className="mt-1">
          <p className="font-medium text-slate-700">{s.gaps(logger.gaps.length)}</p>
          <ul className="list-inside list-disc text-slate-600">
            {logger.gaps.map((g) => (
              <li key={g.from}>{s.gapLine(g.from, g.to, g.minutes)}</li>
            ))}
          </ul>
        </div>
      )}
    </li>
  );
}

export function FilesAndLoggers({ preview }: { preview: PreviewResult }) {
  const s = strings.upload;
  return (
    <>
      <section>
        <h3 className={h3}>{s.filesTitle}</h3>
        <div className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
          {preview.files.map((f) => (
            <FileDetails key={f.name} file={f} />
          ))}
        </div>
      </section>
      {preview.loggers.length > 0 && (
        <section>
          <h3 className={h3}>{s.loggersTitle}</h3>
          <ul className="mt-2 divide-y divide-slate-200 overflow-hidden rounded-lg border border-slate-200 bg-white">
            {preview.loggers.map((l) => (
              <LoggerDetails key={l.loggerId} logger={l} />
            ))}
          </ul>
        </section>
      )}
    </>
  );
}

export function SavedResult({ result, onMore }: { result: ConfirmResult; onMore: () => void }) {
  const s = strings.upload;
  const created = [...result.createdBranches.map(s.newBranch), ...result.createdFridges.map(s.newFridge)];
  return (
    <section className="rounded-lg border-2 border-green-600 bg-white p-4" role="status">
      <h2 className="text-xl font-semibold">{s.doneTitle}</h2>
      <p className="mt-1">{s.done(result.newRows)}</p>
      <p className="text-sm text-slate-600">{s.doneSkipped(result.alreadyInDb, result.exactDuplicates)}</p>
      {result.conflicts > 0 && <p className="text-sm text-amber-800">{s.doneConflicts(result.conflicts)}</p>}
      {created.length > 0 && (
        <p className="mt-2 text-sm">
          <span className="text-slate-500">{s.doneCreated}: </span>
          {created.join(', ')}
        </p>
      )}
      <ul className="mt-2 text-sm text-slate-600">
        {result.files.map((f) => (
          <li key={f.name} className="break-words">
            {f.name}: {s.fileNew(f.newRows)}
          </li>
        ))}
      </ul>
      <div className="mt-4 flex flex-wrap gap-2">
        <a href={href.dashboard} className="rounded-lg bg-slate-800 px-4 py-2 font-medium text-white">
          {s.toDashboard}
        </a>
        <button type="button" onClick={onMore} className="rounded-lg border border-slate-800 px-4 py-2 font-medium">
          {s.uploadMore}
        </button>
      </div>
    </section>
  );
}

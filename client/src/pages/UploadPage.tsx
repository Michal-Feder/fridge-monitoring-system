import { useEffect, useRef, useState } from 'react';
import { api, ApiError, type BranchInfo, type ConfirmResult, type Decisions, type PreviewResult, type Unit, type UploadFile } from '../api.ts';
import { strings } from '../strings.ts';
import { FilePicker } from '../components/upload/FilePicker.tsx';
import { AssignDecision, UnitDecision } from '../components/upload/Decisions.tsx';
import { Checks, FilesAndLoggers, SavedResult, Totals } from '../components/upload/PreviewDetails.tsx';

const errorText = (e: unknown) => (e instanceof ApiError && e.message === 'offline' ? strings.common.offline : strings.common.error(String((e as Error).message)));

/**
 * Upload, then confirm (D16). The browser keeps the file texts and the decisions; every change re-runs the
 * stateless preview, and Save sends the same files + decisions to confirm. Nothing is stored before Save.
 */
export function UploadPage() {
  const s = strings.upload;
  const [files, setFiles] = useState<UploadFile[]>([]);
  const [decisions, setDecisions] = useState<Decisions>({});
  const [preview, setPreview] = useState<PreviewResult | null>(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<ConfirmResult | null>(null);
  const [branches, setBranches] = useState<BranchInfo[]>([]);
  const seq = useRef(0);

  useEffect(() => {
    api.branches().then(setBranches, () => setBranches([])); // only for suggestions; the form works without them
  }, [result]);

  useEffect(() => {
    const mine = ++seq.current; // a slower, older preview must not overwrite a newer one
    if (files.length === 0) {
      setPreview(null);
      setChecking(false);
      return;
    }
    setChecking(true);
    api
      .preview(files, decisions)
      .then((p) => mine === seq.current && (setPreview(p), setError(null)))
      .catch((e: unknown) => mine === seq.current && setError(errorText(e)))
      .finally(() => mine === seq.current && setChecking(false));
  }, [files, decisions]);

  const addFiles = (added: UploadFile[]) => {
    setResult(null);
    // the same name again replaces the earlier copy (the server refuses two files with one name)
    setFiles((cur) => [...cur.filter((f) => !added.some((a) => a.name === f.name)), ...added]);
  };
  const removeFile = (name: string) => {
    setFiles((cur) => cur.filter((f) => f.name !== name));
    setDecisions((d) => {
      const raw = { ...d.raw };
      delete raw[name];
      return { ...d, raw };
    });
  };
  const chooseUnit = (loggerId: string, unit: Unit) => setDecisions((d) => ({ ...d, units: { ...d.units, [loggerId]: unit } }));
  const assign = (file: string, raw: NonNullable<Decisions['raw']>[string]) => setDecisions((d) => ({ ...d, raw: { ...d.raw, [file]: raw } }));
  const reset = () => {
    setFiles([]);
    setDecisions({});
    setResult(null);
    setError(null);
  };

  const save = async () => {
    setSaving(true);
    try {
      const r = await api.confirm(files, decisions);
      if (r.ok) {
        setResult(r);
        setFiles([]);
        setDecisions({});
        window.scrollTo(0, 0);
      } else {
        setError(r.blocking.join(' '));
      }
    } catch (e) {
      setError(errorText(e));
    } finally {
      setSaving(false);
    }
  };

  if (result) return <SavedResult result={result} onMore={reset} />;

  // a logger whose values fit no unit is shown even when its unit was confirmed earlier: it blocks saving (D42)
  const unitLoggers = preview?.loggers.filter((l) => l.needsUnitDecision || l.suggestion.unit === null) ?? [];
  const assignFiles = preview?.files.filter((f) => f.ok && f.raw && (f.raw.needsAssignment || f.raw.fridgeSource === 'decision')) ?? [];
  // what blocks saving and has no decision card of its own, e.g. saved rows under another fridge (D51): shown as text
  const covered = [...unitLoggers.map((l) => `${l.loggerId}: `), ...assignFiles.map((f) => `${f.name}: `)];
  const otherBlocking = preview?.blocking.filter((b) => !covered.some((c) => b.startsWith(c))) ?? [];
  // the preview shown belongs to the current files only when it lists exactly them
  const current = preview !== null && preview.files.length === files.length && files.every((f) => preview.files.some((p) => p.name === f.name));

  return (
    <section className="space-y-5">
      <div>
        <h2 className="text-xl font-semibold">{s.title}</h2>
        <p className="text-sm text-slate-600">{s.intro}</p>
      </div>

      <FilePicker files={files} onAdd={addFiles} onRemove={removeFile} onError={setError} />

      {error && (
        <p className="break-words rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-900" role="alert">
          {error}
        </p>
      )}
      {checking && !current && <p className="text-slate-500">{s.checking}</p>}

      {preview && current && (
        <>
          <Totals totals={preview.totals} />

          {(assignFiles.length > 0 || unitLoggers.length > 0) && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{s.decide}</h3>
              <div className="mt-2 space-y-3">
                {assignFiles.map((f) => (
                  <AssignDecision key={f.name} file={f} branches={branches} current={decisions.raw?.[f.name]} onApply={(d) => assign(f.name, d)} />
                ))}
                {unitLoggers.map((l) => (
                  <UnitDecision key={l.loggerId} logger={l} chosen={decisions.units?.[l.loggerId]} onChoose={(u) => chooseUnit(l.loggerId, u)} />
                ))}
              </div>
            </section>
          )}

          {otherBlocking.length > 0 && (
            <section>
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">{s.cannotSave}</h3>
              <ul className="mt-2 space-y-1.5">
                {otherBlocking.map((b) => (
                  <li key={b} className="break-words rounded-lg border-2 border-red-400 bg-red-50 p-2 text-sm text-red-900" role="alert">
                    {b}
                  </li>
                ))}
              </ul>
            </section>
          )}
          <Checks preview={preview} />
          <FilesAndLoggers preview={preview} />

          <div className="sticky bottom-0 -mx-4 border-t border-slate-200 bg-white/95 px-4 py-2.5 backdrop-blur">
            {!preview.canConfirm && <p className="mb-1.5 text-sm font-medium text-amber-800">{s.blocked(preview.blocking.length)}</p>}
            <div className="flex items-center justify-between gap-3">
              <button type="button" onClick={reset} className="text-sm text-slate-600 underline">
                {s.clear}
              </button>
              <button
                type="button"
                onClick={save}
                disabled={!preview.canConfirm || saving || checking}
                className="whitespace-nowrap rounded-lg bg-green-700 px-4 py-2.5 font-semibold text-white disabled:bg-slate-300 disabled:text-slate-600"
              >
                {saving ? s.saving : preview.totals.newRows > 0 ? s.save(preview.totals.newRows) : s.saveNothing}
              </button>
            </div>
          </div>
        </>
      )}
    </section>
  );
}

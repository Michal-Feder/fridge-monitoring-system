import { useRef, useState } from 'react';
import type { UploadFile } from '../../api.ts';
import { strings } from '../../strings.ts';
import { ExcelFormatError, xlsxToTsv } from '../../excel.ts';

interface Props {
  files: UploadFile[];
  onAdd: (files: UploadFile[]) => void;
  onRemove: (name: string) => void;
  onError: (message: string) => void;
}

/** Choose files (Excel .xlsx, CSV, TSV), drop them, or paste rows from Excel. Everything becomes text in the browser (D16, D50). */
export function FilePicker({ files, onAdd, onRemove, onError }: Props) {
  const s = strings.upload;
  const input = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [paste, setPaste] = useState('');
  const pasteCount = useRef(0);

  const read = async (list: FileList | null) => {
    if (!list?.length) return;
    const out: UploadFile[] = [];
    for (const f of Array.from(list)) {
      try {
        // D50: an Excel file becomes tab-separated text here; the server only ever sees text
        const excel = /\.xlsx?$/i.test(f.name) || f.type.includes('spreadsheetml') || f.type === 'application/vnd.ms-excel';
        out.push({ name: f.name, text: excel ? await xlsxToTsv(f) : await f.text() });
      } catch (e) {
        onError(e instanceof ExcelFormatError ? s.oldXls(f.name) : s.readError(f.name));
      }
    }
    if (out.length) onAdd(out);
  };

  const addPaste = () => {
    if (!paste.trim()) return;
    let name: string;
    do name = s.pastedName(++pasteCount.current);
    while (files.some((f) => f.name === name));
    onAdd([{ name, text: paste }]);
    setPaste('');
  };

  return (
    <div className="space-y-3">
      <div
        onDragOver={(e) => {
          e.preventDefault();
          setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => {
          e.preventDefault();
          setDragging(false);
          void read(e.dataTransfer.files);
        }}
        className={`flex flex-col items-center gap-1 rounded-lg border-2 border-dashed p-4 text-center ${dragging ? 'border-slate-800 bg-slate-100' : 'border-slate-300 bg-white'}`}
      >
        <button type="button" onClick={() => input.current?.click()} className="rounded-lg bg-slate-800 px-4 py-2.5 font-medium text-white">
          {s.pick}
        </button>
        <span className="text-sm text-slate-500">{s.drop}</span>
        <input
          ref={input}
          type="file"
          multiple
          accept={s.accept}
          className="hidden"
          onChange={(e) => {
            void read(e.target.files);
            e.target.value = ''; // picking the same file again must fire onChange again
          }}
        />
      </div>

      <details className="rounded-lg border border-slate-200 bg-white" open={paste.length > 0 || undefined}>
        <summary className="cursor-pointer px-3 py-2.5 text-sm font-medium">{s.pasteLabel}</summary>
        <div className="space-y-2 border-t border-slate-100 p-3">
          <textarea
            value={paste}
            onChange={(e) => setPaste(e.target.value)}
            rows={5}
            placeholder={s.pastePlaceholder}
            className="block w-full rounded border border-slate-300 p-2 font-mono text-xs"
            spellCheck={false}
          />
          <button type="button" onClick={addPaste} disabled={!paste.trim()} className="rounded-lg border border-slate-800 px-3 py-1.5 text-sm font-medium disabled:opacity-40">
            {s.pasteAdd}
          </button>
        </div>
      </details>

      {files.length > 0 && (
        <ul aria-label={s.files(files.length)} className="flex flex-wrap gap-2">
          {files.map((f) => (
            <li key={f.name} className="flex max-w-full items-center gap-1 rounded-full border border-slate-300 bg-white py-1 pl-3 pr-1 text-sm">
              <span className="truncate">{f.name}</span>
              <button type="button" onClick={() => onRemove(f.name)} aria-label={s.removeFile(f.name)} className="shrink-0 rounded-full px-2 text-slate-500 hover:bg-slate-100">
                ×
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

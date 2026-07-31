import { useState, useRef, useMemo } from 'react';
import Papa from 'papaparse';
import {
  FileUp,
  CheckCircle,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Download,
  ArrowLeft,
  ArrowRight,
  CopyCheck,
  CalendarClock,
} from 'lucide-react';
import { useReviewSail } from '../../context/ReviewSailContext';
import {
  IMPORT_FIELDS,
  autoDetectMapping,
  detectDateFormat,
  mapRow,
  validateRow,
  dedupeKey,
  parseImportDate,
  formatDateForDisplay,
  type ColumnMapping,
  type DateFormat,
  type ImportFieldKey,
  type ValidatedRow,
} from '../../lib/csvImport';

type Step = 'upload' | 'map' | 'review' | 'result';

type ParsedFile = {
  fileName: string;
  headers: string[];
  /** Every data row, header row excluded. */
  records: Record<string, string>[];
};

const STEP_ORDER: Step[] = ['upload', 'map', 'review', 'result'];
const PREVIEW_ROWS = 5;

const DATE_FORMAT_OPTIONS: Array<{ value: DateFormat; label: string }> = [
  { value: 'DMY', label: 'Day first — 03/04/2026 is 3 April' },
  { value: 'MDY', label: 'Month first — 03/04/2026 is 4 March' },
  { value: 'YMD', label: 'Year first — 2026-04-03' },
];

export default function CsvImportWizard() {
  const { activeLocationId, bulkImport, fetchExistingImportKeys } = useReviewSail();

  const [step, setStep] = useState<Step>('upload');
  const [dragActive, setDragActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const [parsed, setParsed] = useState<ParsedFile | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>('DMY');
  const [dateFormatAmbiguous, setDateFormatAmbiguous] = useState(false);

  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [showAllIssues, setShowAllIssues] = useState(false);
  const [result, setResult] = useState<{ imported: number; skippedDuplicates: number } | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setParsed(null);
    setMapping({});
    setValidated([]);
    setResult(null);
    setError('');
    setShowAllIssues(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  // --- Step 1: upload -----------------------------------------------------

  const handleFile = (file: File) => {
    setError('');

    if (file.type !== 'text/csv' && !file.name.toLowerCase().endsWith('.csv')) {
      setError('Please upload a .csv file.');
      return;
    }

    setBusy(true);
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: results => {
        setBusy(false);

        const headers = results.meta.fields || [];
        const records = results.data as Record<string, string>[];

        if (headers.length === 0 || records.length === 0) {
          setError('That file has no readable rows. Make sure the first line contains column headers.');
          return;
        }

        const detected = autoDetectMapping(headers);
        setParsed({ fileName: file.name, headers, records });
        setMapping(detected);

        // Seed the date convention from the check-out column if we found one.
        const checkoutHeader = detected.checkoutDate;
        if (checkoutHeader) {
          const samples = records.slice(0, 50).map(r => (r[checkoutHeader] ?? '').toString());
          const detection = detectDateFormat(samples);
          setDateFormat(detection.format);
          setDateFormatAmbiguous(detection.ambiguous);
        } else {
          setDateFormatAmbiguous(true);
        }

        setStep('map');
      },
      error: err => {
        setBusy(false);
        setError(`Could not read that file: ${err.message}`);
      },
    });
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') setDragActive(true);
    else if (e.type === 'dragleave') setDragActive(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
    if (e.dataTransfer.files?.[0]) handleFile(e.dataTransfer.files[0]);
  };

  // --- Step 2: mapping ----------------------------------------------------

  const setFieldMapping = (field: ImportFieldKey, header: string) => {
    setMapping(prev => {
      const next = { ...prev };
      // A CSV column can only feed one field; clear any prior claim on it.
      for (const key of Object.keys(next) as ImportFieldKey[]) {
        if (next[key] === header) delete next[key];
      }
      if (header) next[field] = header;
      else delete next[field];
      return next;
    });
  };

  const missingRequired = IMPORT_FIELDS.filter(f => f.required && !mapping[f.key]);
  const hasContactColumn = !!mapping.email || !!mapping.phone;

  const previewRows = useMemo(() => {
    if (!parsed) return [];
    return parsed.records
      .slice(0, PREVIEW_ROWS)
      .map((record, i) => mapRow(record, mapping, dateFormat, i + 2));
  }, [parsed, mapping, dateFormat]);

  const goToReview = async () => {
    if (!parsed) return;
    setBusy(true);
    setError('');

    try {
      const existingKeys = await fetchExistingImportKeys();
      const seen = new Set<string>();

      const rows = parsed.records.map((record, i) => {
        // +2: the header occupies line 1, and records are 0-indexed.
        const row = validateRow(mapRow(record, mapping, dateFormat, i + 2));
        if (row.status === 'error') return row;

        const key = dedupeKey(row);
        if (key && (existingKeys.has(key) || seen.has(key))) {
          return { ...row, status: 'duplicate' as const };
        }
        if (key) seen.add(key);
        return row;
      });

      setValidated(rows);
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'Could not check for existing guests.');
    } finally {
      setBusy(false);
    }
  };

  // --- Step 3: review -----------------------------------------------------

  const counts = useMemo(() => ({
    ready: validated.filter(r => r.status === 'ok' || r.status === 'warning').length,
    warnings: validated.filter(r => r.status === 'warning').length,
    duplicates: validated.filter(r => r.status === 'duplicate').length,
    errors: validated.filter(r => r.status === 'error').length,
    // Stays that have not finished yet. Counted from the issue rather than the
    // status, because an upcoming stay is a perfectly healthy row.
    upcoming: validated.filter(r => r.issues.some(i => i.level === 'info')).length,
  }), [validated]);

  const problemRows = useMemo(
    () => validated.filter(r => r.status === 'error' || r.status === 'warning'),
    [validated],
  );

  const runImport = async () => {
    setBusy(true);
    setError('');

    const importable = validated.filter(r => r.status === 'ok' || r.status === 'warning');
    const response = await bulkImport(
      importable.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        checkoutDate: r.checkoutDate!,
        checkinDate: r.checkinDate,
      })),
    );

    setBusy(false);

    if (!response.success) {
      setError(response.error || 'Import failed.');
      return;
    }

    setResult({
      imported: response.imported,
      // Duplicates caught at review plus any the context caught on re-check.
      skippedDuplicates: counts.duplicates + response.skippedDuplicates,
    });
    setStep('result');
  };

  const downloadErrorRows = () => {
    const failed = validated.filter(r => r.status === 'error');
    if (failed.length === 0 || !parsed) return;

    const csv = Papa.unparse(
      failed.map(r => ({
        ...r.raw,
        'ReviewSail issue': r.issues.map(i => i.message).join('; '),
      })),
    );

    const url = URL.createObjectURL(new Blob([csv], { type: 'text/csv;charset=utf-8;' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = parsed.fileName.replace(/\.csv$/i, '') + '-errors.csv';
    link.click();
    URL.revokeObjectURL(url);
  };

  // --- Render -------------------------------------------------------------

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="bg-white rounded-xl border border-gray-200 p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-gray-900 flex items-center gap-2">
          <FileUp size={20} className="text-indigo-500" />
          Bulk Import (CSV)
        </h3>
        {step !== 'upload' && (
          <button
            onClick={reset}
            className="text-xs font-medium text-gray-500 hover:text-gray-700 inline-flex items-center gap-1"
          >
            <X size={14} /> Start over
          </button>
        )}
      </div>

      <div className="flex items-center gap-1.5 mt-4 mb-5" aria-hidden="true">
        {STEP_ORDER.map((s, i) => (
          <div
            key={s}
            className={`h-1.5 flex-1 rounded-full transition-colors ${
              i <= stepIndex ? 'bg-indigo-500' : 'bg-gray-200'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm flex items-start gap-2">
          <AlertCircle size={16} className="mt-0.5 shrink-0" />
          <span>{error}</span>
        </div>
      )}

      {/* Step 1 — Upload */}
      {step === 'upload' && (
        <div
          onDragEnter={handleDrag}
          onDragLeave={handleDrag}
          onDragOver={handleDrag}
          onDrop={handleDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors cursor-pointer
            ${dragActive ? 'border-indigo-400 bg-indigo-50' : 'border-gray-300 hover:border-gray-400 bg-gray-50'}
            ${!activeLocationId ? 'opacity-50 pointer-events-none' : ''}`}
        >
          <input
            ref={fileInputRef}
            type="file"
            accept=".csv"
            onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
            className="hidden"
          />
          {busy ? (
            <RefreshCw size={40} className="mx-auto mb-3 text-indigo-400 animate-spin" />
          ) : (
            <FileUp size={40} className="mx-auto mb-3 text-gray-400" />
          )}
          <p className="text-sm font-medium text-gray-700">
            {busy ? 'Reading your file…' : dragActive ? 'Drop your CSV here' : 'Drag & drop a CSV file, or click to browse'}
          </p>
          <p className="text-xs text-gray-500 mt-1">
            You'll be able to check the columns before anything is imported.
          </p>
        </div>
      )}

      {/* Step 2 — Map columns */}
      {step === 'map' && parsed && (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-gray-600">
              <span className="font-medium text-gray-900">{parsed.fileName}</span> — {parsed.records.length} row
              {parsed.records.length === 1 ? '' : 's'}. We've matched the columns we recognised; correct anything
              that's wrong.
            </p>
          </div>

          <div className="space-y-2">
            {IMPORT_FIELDS.map(field => (
              <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3">
                <label className="text-sm text-gray-700">
                  {field.label}
                  {field.required && <span className="text-red-500 ml-0.5">*</span>}
                  {field.hint && <span className="block text-xs text-gray-400">{field.hint}</span>}
                </label>
                <select
                  value={mapping[field.key] || ''}
                  onChange={e => setFieldMapping(field.key, e.target.value)}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
                >
                  <option value="">— Not imported —</option>
                  {parsed.headers.map(header => (
                    <option key={header} value={header}>{header}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>

          {(dateFormatAmbiguous || !!mapping.checkoutDate) && (
            <div className={`p-3 rounded-lg border text-sm ${
              dateFormatAmbiguous ? 'bg-amber-50 border-amber-200' : 'bg-gray-50 border-gray-200'
            }`}>
              <div className="flex items-start gap-2 mb-2">
                {dateFormatAmbiguous && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-amber-600" />}
                <div>
                  <p className={`font-medium ${dateFormatAmbiguous ? 'text-amber-800' : 'text-gray-700'}`}>
                    Date format
                  </p>
                  <p className={`text-xs ${dateFormatAmbiguous ? 'text-amber-700' : 'text-gray-500'}`}>
                    {dateFormatAmbiguous
                      ? "These dates could be read two ways. Pick the right one — check the preview below to confirm."
                      : 'Detected from your file. Change it if the preview looks wrong.'}
                  </p>
                </div>
              </div>
              <select
                value={dateFormat}
                onChange={e => setDateFormat(e.target.value as DateFormat)}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 outline-none"
              >
                {DATE_FORMAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-gray-500 uppercase tracking-wide mb-2">
              Preview — first {Math.min(PREVIEW_ROWS, previewRows.length)} rows
            </p>
            <div className="overflow-x-auto border border-gray-200 rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-gray-50">
                  <tr>
                    {IMPORT_FIELDS.map(f => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-gray-600 whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100">
                  {previewRows.map(row => (
                    <tr key={row.lineNumber}>
                      <td className="px-3 py-2 whitespace-nowrap">{row.firstName || <Empty />}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.lastName || <Empty />}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.email || <Empty />}</td>
                      <td className="px-3 py-2 whitespace-nowrap">{row.phone || <Empty />}</td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <DateCell iso={row.checkoutDate} mapped={!!mapping.checkoutDate} />
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <DateCell iso={row.checkinDate} mapped={!!mapping.checkinDate} />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {missingRequired.length > 0 && (
            <p className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={15} />
              Map {missingRequired.map(f => f.label.toLowerCase()).join(' and ')} to continue.
            </p>
          )}
          {missingRequired.length === 0 && !hasContactColumn && (
            <p className="text-sm text-amber-700 flex items-center gap-2">
              <AlertTriangle size={15} />
              Map an email or phone column — guests can't be contacted without one.
            </p>
          )}

          <div className="flex justify-between pt-1">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={16} /> Choose another file
            </button>
            <button
              onClick={goToReview}
              disabled={busy || missingRequired.length > 0 || !hasContactColumn}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <RefreshCw size={16} className="animate-spin" /> : <ArrowRight size={16} />}
              Check {parsed.records.length} row{parsed.records.length === 1 ? '' : 's'}
            </button>
          </div>
        </div>
      )}

      {/* Step 3 — Review */}
      {step === 'review' && (
        <div className="space-y-5">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <Tile label="Ready" value={counts.ready} tone="green" />
            <Tile label="Duplicates" value={counts.duplicates} tone="gray" />
            <Tile label="Warnings" value={counts.warnings} tone="amber" />
            <Tile label="Errors" value={counts.errors} tone="red" />
          </div>

          {counts.duplicates > 0 && (
            <p className="text-sm text-gray-600 flex items-start gap-2">
              <CopyCheck size={16} className="mt-0.5 shrink-0 text-gray-400" />
              {counts.duplicates} guest{counts.duplicates === 1 ? ' has' : 's have'} already been imported for the same
              check-out date and will be skipped, so nobody gets a second request.
            </p>
          )}

          {/* Most of an OTA export is stays that have not happened yet. Saying
              so up front is the difference between "this worked" and "why has
              nothing sent?" a week later. */}
          {counts.upcoming > 0 && (
            <p className="text-sm text-gray-600 flex items-start gap-2">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-gray-400" />
              {counts.upcoming} {counts.upcoming === 1 ? 'stay is' : 'stays are'} still upcoming. Those invites are
              scheduled automatically and send the day each guest checks out.
            </p>
          )}

          {problemRows.length > 0 && (
            <div className="border border-gray-200 rounded-lg divide-y divide-gray-100">
              {(showAllIssues ? problemRows : problemRows.slice(0, 8)).map(row => (
                <div key={row.lineNumber} className="px-3 py-2 flex items-start gap-3 text-sm">
                  <span className="text-xs text-gray-400 font-mono pt-0.5 shrink-0">L{row.lineNumber}</span>
                  <span className="text-gray-700 shrink-0 max-w-[10rem] truncate">
                    {[row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name)'}
                  </span>
                  <span className={row.status === 'error' ? 'text-red-600' : 'text-amber-700'}>
                    {row.issues.map(i => i.message).join('; ')}
                  </span>
                </div>
              ))}
              {problemRows.length > 8 && (
                <button
                  onClick={() => setShowAllIssues(v => !v)}
                  className="w-full px-3 py-2 text-xs font-medium text-indigo-600 hover:bg-gray-50"
                >
                  {showAllIssues ? 'Show fewer' : `Show all ${problemRows.length} rows with issues`}
                </button>
              )}
            </div>
          )}

          {counts.errors > 0 && (
            <button
              onClick={downloadErrorRows}
              className="inline-flex items-center gap-2 text-sm font-medium text-indigo-600 hover:text-indigo-700"
            >
              <Download size={15} /> Download the {counts.errors} failed row
              {counts.errors === 1 ? '' : 's'} to fix and re-upload
            </button>
          )}

          <div className="flex justify-between pt-1">
            <button
              onClick={() => setStep('map')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 hover:text-gray-900"
            >
              <ArrowLeft size={16} /> Back to columns
            </button>
            <button
              onClick={runImport}
              disabled={busy || counts.ready === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-indigo-600 rounded-lg hover:bg-indigo-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              {busy ? <RefreshCw size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {busy ? 'Importing…' : `Import ${counts.ready} guest${counts.ready === 1 ? '' : 's'}`}
            </button>
          </div>
        </div>
      )}

      {/* Step 4 — Result */}
      {step === 'result' && result && (
        <div className="space-y-4 text-center py-4">
          <CheckCircle size={40} className="mx-auto text-green-500" />
          <div>
            <p className="text-lg font-semibold text-gray-900">
              Imported {result.imported} guest{result.imported === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-gray-500 mt-1">
              Review requests are queued and will send at your property's preferred hour.
            </p>
          </div>

          {(result.skippedDuplicates > 0 || counts.errors > 0) && (
            <div className="text-sm text-gray-600 space-y-1">
              {result.skippedDuplicates > 0 && (
                <p>{result.skippedDuplicates} already-imported guest{result.skippedDuplicates === 1 ? '' : 's'} skipped.</p>
              )}
              {counts.errors > 0 && (
                <p>
                  {counts.errors} row{counts.errors === 1 ? '' : 's'} could not be imported.{' '}
                  <button onClick={downloadErrorRows} className="text-indigo-600 hover:underline font-medium">
                    Download them
                  </button>
                </p>
              )}
            </div>
          )}

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-indigo-600 bg-indigo-50 rounded-lg hover:bg-indigo-100 transition-colors"
          >
            <FileUp size={16} /> Import another file
          </button>
        </div>
      )}
    </div>
  );
}

const Empty = () => <span className="text-gray-300">—</span>;

/**
 * Shows a parsed date as unambiguous text so a wrong format choice is visible
 * before import, not months later.
 */
const DateCell = ({ iso, mapped }: { iso: string | null; mapped: boolean }) => {
  if (!mapped) return <Empty />;
  if (!iso) return <span className="text-red-500 text-xs">unreadable</span>;
  const parsed = parseImportDate(iso, 'YMD');
  return <span>{parsed ? formatDateForDisplay(parsed) : iso}</span>;
};

const Tile = ({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'gray' }) => {
  const tones = {
    green: 'bg-green-50 border-green-200 text-green-700',
    amber: 'bg-amber-50 border-amber-200 text-amber-700',
    red: 'bg-red-50 border-red-200 text-red-700',
    gray: 'bg-gray-50 border-gray-200 text-gray-600',
  } as const;

  return (
    <div className={`rounded-lg border p-3 ${value > 0 ? tones[tone] : 'bg-gray-50 border-gray-200 text-gray-400'}`}>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
};

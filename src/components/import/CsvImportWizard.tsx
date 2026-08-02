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
  Sparkles,
  ChevronDown,
  ChevronRight,
  Info,
} from 'lucide-react';
import { useReviewSail } from '../../context/ReviewSailContext';
import {
  IMPORT_FIELDS,
  RESERVATION_SOURCES,
  detectMapping,
  toColumnMapping,
  missingRequirements,
  isNameMapped,
  detectDateFormat,
  mapRow,
  validateRow,
  dedupeKey,
  groupIssues,
  downloadCsv,
  parseImportDate,
  formatDateForDisplay,
  type ColumnMapping,
  type DateFormat,
  type ImportFieldKey,
  type MatchConfidence,
  type ReservationSource,
  type ValidatedRow,
} from '../../lib/csvImport';
import { detectPlatform, hasReachableContact, type PlatformDetection } from '../../lib/csvFingerprints';

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
  const [confidence, setConfidence] = useState<Partial<Record<ImportFieldKey, MatchConfidence>>>({});
  /** Set only when the owner picks a convention by hand; otherwise we infer. */
  const [dateFormatOverride, setDateFormatOverride] = useState<DateFormat | null>(null);

  const [platform, setPlatform] = useState<PlatformDetection | null>(null);
  /** Detected files collapse the column list; this reopens it. */
  const [showColumns, setShowColumns] = useState(true);
  /** Applied to any row whose file didn't carry its own source column. */
  const [fallbackSource, setFallbackSource] = useState<ReservationSource>('direct');

  const [validated, setValidated] = useState<ValidatedRow[]>([]);
  const [excluded, setExcluded] = useState<Set<number>>(new Set());
  const [openGroups, setOpenGroups] = useState<Set<string>>(new Set());
  const [result, setResult] = useState<
    { imported: number; skippedDuplicates: number; failed: number } | null
  >(null);

  const fileInputRef = useRef<HTMLInputElement>(null);

  const reset = () => {
    setStep('upload');
    setParsed(null);
    setMapping({});
    setConfidence({});
    setDateFormatOverride(null);
    setPlatform(null);
    setShowColumns(true);
    setFallbackSource('direct');
    setValidated([]);
    setExcluded(new Set());
    setOpenGroups(new Set());
    setResult(null);
    setError('');
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

        // A recognised OTA export tells us more than header-by-header guessing
        // can, so it takes precedence when one matches.
        const knownPlatform = detectPlatform(headers);
        let detected: ColumnMapping;

        if (knownPlatform) {
          detected = knownPlatform.mapping;
          setPlatform(knownPlatform);
          setFallbackSource(knownPlatform.source);
          // Collapse the column list — the owner shouldn't have to confirm work
          // we're confident about, but the toggle keeps it one click away.
          setShowColumns(false);
          setConfidence(
            Object.fromEntries(
              IMPORT_FIELDS.map(f => [f.key, detected[f.key] ? 'matched' : 'none']),
            ) as Partial<Record<ImportFieldKey, MatchConfidence>>,
          );
        } else {
          const detection = detectMapping(headers);
          detected = toColumnMapping(detection);
          setPlatform(null);
          setShowColumns(true);
          setConfidence(
            Object.fromEntries(
              IMPORT_FIELDS.map(f => [f.key, detection[f.key].confidence]),
            ) as Partial<Record<ImportFieldKey, MatchConfidence>>,
          );
        }

        setParsed({ fileName: file.name, headers, records });
        setMapping(detected);
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
    // Fields that are about to lose this column to the one being set.
    const stolenFrom = header
      ? (Object.keys(mapping) as ImportFieldKey[]).filter(k => k !== field && mapping[k] === header)
      : [];

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

    setConfidence(prev => {
      // Once the owner has made the call, our confidence in our own guess is
      // no longer worth showing.
      const next = { ...prev, [field]: undefined };
      // And a field that just lost its column is no longer "Matched" — leaving
      // that badge up next to an empty dropdown is a straight contradiction.
      for (const key of stolenFrom) next[key] = undefined;
      return next;
    });
    // A different date column deserves a fresh reading, not the convention
    // they picked for the previous one.
    if (field === 'checkoutDate') setDateFormatOverride(null);
  };

  /**
   * Inferred from whichever column is mapped to check-out *right now*.
   *
   * Derived rather than captured at upload: the owner can map a date column by
   * hand after the fact, and a convention detected from the file we guessed at
   * would then be stale — or, on a file with no dates at all, invented.
   */
  const dateDetection = useMemo(() => {
    const header = mapping.checkoutDate;
    if (!parsed || !header) return null;
    return detectDateFormat(parsed.records.slice(0, 50).map(r => (r[header] ?? '').toString()));
  }, [parsed, mapping.checkoutDate]);

  const dateFormat: DateFormat = dateFormatOverride ?? dateDetection?.format ?? 'DMY';
  const dateFormatAmbiguous = !dateFormatOverride && !!dateDetection?.ambiguous;

  const missing = missingRequirements(mapping);

  /** Columns worth showing in the preview: the combined-name input is an
      instruction to us, not a value the owner needs to see echoed back. */
  const previewFields = IMPORT_FIELDS.filter(f => f.key !== 'fullName');

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
      // Rows that can't be imported start excluded, so the checkboxes read as
      // "what will be imported" rather than needing to be decoded.
      setExcluded(new Set(rows.filter(r => r.status === 'error').map(r => r.lineNumber)));
      setOpenGroups(new Set());
      setStep('review');
    } catch (e: any) {
      setError(e.message || 'Could not check for existing guests.');
    } finally {
      setBusy(false);
    }
  };

  // --- Step 3: review -----------------------------------------------------

  /** Rows the owner has not excluded and that are importable in principle. */
  const importableRows = useMemo(
    () =>
      validated.filter(
        r => (r.status === 'ok' || r.status === 'warning') && !excluded.has(r.lineNumber),
      ),
    [validated, excluded],
  );

  const counts = useMemo(() => ({
    ready: importableRows.length,
    warnings: validated.filter(r => r.status === 'warning').length,
    duplicates: validated.filter(r => r.status === 'duplicate').length,
    errors: validated.filter(r => r.status === 'error').length,
    // Rows the owner deselected by hand, over and above the failed ones.
    excluded: validated.filter(r => r.status !== 'error' && excluded.has(r.lineNumber)).length,
    // Stays that have not finished yet. Counted from the issue rather than the
    // status, because an upcoming stay is a perfectly healthy row.
    upcoming: validated.filter(r => r.issues.some(i => i.level === 'info')).length,
  }), [validated, excluded, importableRows]);

  const issueGroups = useMemo(() => groupIssues(validated), [validated]);

  const rowsByLine = useMemo(
    () => new Map(validated.map(r => [r.lineNumber, r])),
    [validated],
  );

  const toggleExcluded = (lineNumber: number) => {
    setExcluded(prev => {
      const next = new Set(prev);
      if (next.has(lineNumber)) next.delete(lineNumber);
      else next.add(lineNumber);
      return next;
    });
  };

  const excludeAll = (lineNumbers: number[]) => {
    setExcluded(prev => new Set([...prev, ...lineNumbers]));
  };

  const runImport = async () => {
    setBusy(true);
    setError('');

    const response = await bulkImport(
      importableRows.map(r => ({
        firstName: r.firstName,
        lastName: r.lastName,
        email: r.email,
        phone: r.phone,
        checkoutDate: r.checkoutDate!,
        checkinDate: r.checkinDate,
        // A per-row source column wins; otherwise everything in this file gets
        // the detected platform or the owner's choice.
        source: r.source || fallbackSource,
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
      failed: response.failed,
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

    downloadCsv(parsed.fileName.replace(/\.csv$/i, '') + '-errors.csv', csv);
  };

  // --- Render -------------------------------------------------------------

  const stepIndex = STEP_ORDER.indexOf(step);

  return (
    <div className="bg-card rounded-xl border border-line p-6">
      <div className="flex items-center justify-between mb-1">
        <h3 className="text-lg font-semibold text-ink flex items-center gap-2">
          <FileUp size={20} className="text-brand-500" />
          Bulk Import (CSV)
        </h3>
        {step !== 'upload' && (
          <button
            onClick={reset}
            className="text-xs font-medium text-ink-muted hover:text-ink inline-flex items-center gap-1"
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
              i <= stepIndex ? 'bg-brand-500' : 'bg-line'
            }`}
          />
        ))}
      </div>

      {error && (
        <div className="mb-4 p-3 rounded-lg bg-critical-soft border border-critical/20 text-critical text-sm flex items-start gap-2">
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
            ${dragActive ? 'border-brand-400 bg-brand-50' : 'border-line hover:border-line bg-canvas'}
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
            <RefreshCw size={40} className="mx-auto mb-3 text-brand-400 animate-spin" />
          ) : (
            <FileUp size={40} className="mx-auto mb-3 text-ink-faint" />
          )}
          <p className="text-sm font-medium text-ink">
            {busy ? 'Reading your file…' : dragActive ? 'Drop your CSV here' : 'Drag & drop a CSV file, or click to browse'}
          </p>
          <p className="text-xs text-ink-muted mt-1">
            You'll be able to check the columns before anything is imported.
          </p>
        </div>
      )}

      {/* Step 2 — Map columns */}
      {step === 'map' && parsed && (
        <div className="space-y-5">
          <div>
            <p className="text-sm text-ink-muted">
              <span className="font-medium text-ink">{parsed.fileName}</span> — {parsed.records.length} row
              {parsed.records.length === 1 ? '' : 's'}.
              {!platform && " We've matched the columns we recognised; correct anything that's wrong."}
            </p>
          </div>

          {platform && (
            <div className="p-3 rounded-lg border border-brand-200 bg-brand-50">
              <div className="flex items-start gap-2">
                <Sparkles size={16} className="mt-0.5 shrink-0 text-brand-600" />
                <div className="min-w-0">
                  <p className="text-sm font-medium text-brand-700">
                    Detected {platform.label} export — mapping applied automatically
                  </p>
                  <p className="text-xs text-brand-600 mt-0.5">
                    Check the preview below. Nothing is saved until you import.
                  </p>
                  {!hasReachableContact(platform.mapping) && (
                    <p className="text-xs text-caution mt-1.5">
                      This export has no email or phone column, so these guests can't be contacted yet.
                      {platform.key === 'airbnb'
                        ? ' Airbnb hides guest addresses — add a phone column, or export from your channel manager instead.'
                        : ' Map a contact column below if your file has one.'}
                    </p>
                  )}
                </div>
              </div>
              <button
                onClick={() => setShowColumns(v => !v)}
                className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-brand-700 hover:text-brand-800"
              >
                {showColumns ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
                {showColumns ? 'Hide columns' : 'Review or adjust columns'}
              </button>
            </div>
          )}

          {/* Never stay collapsed when there's something the owner must fix —
              a hidden dropdown and a disabled button is a dead end. */}
          {(showColumns || missing.length > 0) && (
            <div className="space-y-2">
              {IMPORT_FIELDS.map(field => (
                <div key={field.key} className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3">
                  <label className="text-sm text-ink">
                    {field.label}
                    {field.required && <span className="text-critical ml-0.5">*</span>}
                    <ConfidenceBadge confidence={confidence[field.key]} mapped={!!mapping[field.key]} />
                    {field.hint && <span className="block text-xs text-ink-faint">{field.hint}</span>}
                  </label>
                  <select
                    aria-label={field.label}
                    value={mapping[field.key] || ''}
                    onChange={e => setFieldMapping(field.key, e.target.value)}
                    className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-card focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
                  >
                    <option value="">— Not imported —</option>
                    {parsed.headers.map(header => (
                      <option key={header} value={header}>{header}</option>
                    ))}
                  </select>
                </div>
              ))}
            </div>
          )}

          {/* Only worth asking when the file itself doesn't say. */}
          {!mapping.source && (
            <div className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)] items-center gap-3">
              <label className="text-sm text-ink">
                Source for this file
                <span className="block text-xs text-ink-faint">
                  Applied to every row, since no source column was mapped
                </span>
              </label>
              <select
                aria-label="Source for this file"
                value={fallbackSource}
                onChange={e => setFallbackSource(e.target.value as ReservationSource)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-card focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                {RESERVATION_SOURCES.map(s => (
                  <option key={s.value} value={s.value}>{s.label}</option>
                ))}
              </select>
            </div>
          )}

          {/* Only when a date column is actually mapped. Warning about how to
              read dates in a file that has none is pure noise. */}
          {!!mapping.checkoutDate && (
            <div className={`p-3 rounded-lg border text-sm ${
              dateFormatAmbiguous ? 'bg-caution-soft border-caution/20' : 'bg-canvas border-line'
            }`}>
              <div className="flex items-start gap-2 mb-2">
                {dateFormatAmbiguous && <AlertTriangle size={16} className="mt-0.5 shrink-0 text-caution" />}
                <div>
                  <p className={`font-medium ${dateFormatAmbiguous ? 'text-caution' : 'text-ink'}`}>
                    Date format
                  </p>
                  <p className={`text-xs ${dateFormatAmbiguous ? 'text-caution' : 'text-ink-muted'}`}>
                    {dateFormatAmbiguous
                      ? "These dates could be read two ways. Pick the right one — check the preview below to confirm."
                      : 'Detected from your file. Change it if the preview looks wrong.'}
                  </p>
                </div>
              </div>
              <select
                aria-label="Date format"
                value={dateFormat}
                onChange={e => setDateFormatOverride(e.target.value as DateFormat)}
                className="w-full px-3 py-2 border border-line rounded-lg text-sm bg-card focus:ring-2 focus:ring-brand-500 focus:border-brand-500 outline-none"
              >
                {DATE_FORMAT_OPTIONS.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))}
              </select>
            </div>
          )}

          <div>
            <p className="text-xs font-medium text-ink-muted uppercase tracking-wide mb-2">
              Preview — first {Math.min(PREVIEW_ROWS, previewRows.length)} rows
            </p>
            <div className="overflow-x-auto border border-line rounded-lg">
              <table className="min-w-full text-sm">
                <thead className="bg-canvas">
                  <tr>
                    {previewFields.map(f => (
                      <th key={f.key} className="px-3 py-2 text-left font-medium text-ink-muted whitespace-nowrap">
                        {f.label}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-line">
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
                      <td className="px-3 py-2 whitespace-nowrap">
                        {RESERVATION_SOURCES.find(s => s.value === (row.source || fallbackSource))?.label
                          || <Empty />}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {missing.length > 0 && (
            <p className="text-sm text-caution flex items-start gap-2">
              <AlertTriangle size={15} className="mt-0.5 shrink-0" />
              <span>
                Still need {missing.join(', ').replace(/, ([^,]*)$/, ' and $1')} before you can continue.
                {!isNameMapped(mapping) && ' If your file has one combined name column, map it to Full name.'}
              </span>
            </p>
          )}

          <div className="flex justify-between pt-1">
            <button
              onClick={reset}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={16} /> Choose another file
            </button>
            <button
              onClick={goToReview}
              disabled={busy || missing.length > 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
            <p className="text-sm text-ink-muted flex items-start gap-2">
              <CopyCheck size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              {counts.duplicates} guest{counts.duplicates === 1 ? ' has' : 's have'} already been imported for the same
              check-out date and will be skipped, so nobody gets a second request.
            </p>
          )}

          {/* Most of an OTA export is stays that have not happened yet. Saying
              so up front is the difference between "this worked" and "why has
              nothing sent?" a week later. */}
          {counts.upcoming > 0 && (
            <p className="text-sm text-ink-muted flex items-start gap-2">
              <CalendarClock size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              {counts.upcoming} {counts.upcoming === 1 ? 'stay is' : 'stays are'} still upcoming. Those invites are
              scheduled automatically and send the day each guest checks out.
            </p>
          )}

          {issueGroups.length > 0 && (
            <div className="border border-line rounded-lg divide-y divide-line">
              {issueGroups.map(group => {
                const groupKey = `${group.level}:${group.message}`;
                const isOpen = openGroups.has(groupKey);
                const tone =
                  group.level === 'error' ? 'text-critical'
                    : group.level === 'warning' ? 'text-caution'
                      : 'text-ink-muted';

                return (
                  <div key={groupKey}>
                    <button
                      onClick={() =>
                        setOpenGroups(prev => {
                          const next = new Set(prev);
                          if (next.has(groupKey)) next.delete(groupKey);
                          else next.add(groupKey);
                          return next;
                        })
                      }
                      className="w-full px-3 py-2.5 flex items-center gap-2 text-sm text-left hover:bg-canvas"
                    >
                      {isOpen ? <ChevronDown size={14} className="shrink-0 text-ink-faint" />
                        : <ChevronRight size={14} className="shrink-0 text-ink-faint" />}
                      <span className="font-medium text-ink shrink-0">{group.count}</span>
                      <span className={`${tone} min-w-0 truncate`}>{group.message}</span>
                    </button>

                    {isOpen && (
                      <div className="bg-canvas border-t border-line">
                        {group.lineNumbers.map(line => {
                          const row = rowsByLine.get(line);
                          if (!row) return null;
                          const canImport = row.status === 'ok' || row.status === 'warning';
                          return (
                            <label
                              key={line}
                              className={`px-3 py-1.5 flex items-center gap-3 text-sm ${
                                canImport ? 'cursor-pointer hover:bg-card' : 'opacity-60'
                              }`}
                            >
                              <input
                                type="checkbox"
                                checked={canImport && !excluded.has(line)}
                                disabled={!canImport}
                                onChange={() => toggleExcluded(line)}
                                className="shrink-0 accent-brand-600"
                              />
                              <span className="text-xs text-ink-faint font-mono shrink-0">L{line}</span>
                              <span className="text-ink truncate">
                                {[row.firstName, row.lastName].filter(Boolean).join(' ') || '(no name)'}
                              </span>
                              <span className="text-ink-faint text-xs truncate ml-auto">
                                {row.email || row.phone || 'no contact'}
                              </span>
                            </label>
                          );
                        })}

                        {group.level !== 'error' && (
                          <button
                            onClick={() => excludeAll(group.lineNumbers)}
                            className="w-full px-3 py-2 text-xs font-medium text-brand-600 hover:bg-card text-left"
                          >
                            Exclude all {group.count} of these rows
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {counts.excluded > 0 && (
            <p className="text-sm text-ink-muted flex items-start gap-2">
              <Info size={16} className="mt-0.5 shrink-0 text-ink-faint" />
              You've excluded {counts.excluded} row{counts.excluded === 1 ? '' : 's'}. They won't be imported.
            </p>
          )}

          {counts.errors > 0 && (
            <button
              onClick={downloadErrorRows}
              className="inline-flex items-center gap-2 text-sm font-medium text-brand-600 hover:text-brand-700"
            >
              <Download size={15} /> Download the {counts.errors} failed row
              {counts.errors === 1 ? '' : 's'} to fix and re-upload
            </button>
          )}

          <div className="flex justify-between pt-1">
            <button
              onClick={() => setStep('map')}
              className="inline-flex items-center gap-2 px-4 py-2 text-sm font-medium text-ink-muted hover:text-ink"
            >
              <ArrowLeft size={16} /> Back to columns
            </button>
            <button
              onClick={runImport}
              disabled={busy || counts.ready === 0}
              className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-white bg-brand-600 rounded-lg hover:bg-brand-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
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
          <CheckCircle size={40} className="mx-auto text-positive" />
          <div>
            <p className="text-lg font-semibold text-ink">
              Imported {result.imported} guest{result.imported === 1 ? '' : 's'}
            </p>
            <p className="text-sm text-ink-muted mt-1">
              Review requests are queued and will send at your property's preferred hour.
            </p>
          </div>

          {/* Three explicit numbers, always. "Imported 12" alone leaves the
              owner guessing what happened to the other 40 rows in their file. */}
          <div className="grid grid-cols-3 gap-3 text-left">
            <Tile label="Imported" value={result.imported} tone="green" />
            <Tile label="Skipped" value={result.skippedDuplicates + counts.excluded} tone="gray" />
            <Tile label="Failed" value={result.failed + counts.errors} tone="red" />
          </div>

          <div className="text-sm text-ink-muted space-y-1">
            {result.skippedDuplicates > 0 && (
              <p>{result.skippedDuplicates} already-imported guest{result.skippedDuplicates === 1 ? '' : 's'} skipped.</p>
            )}
            {counts.excluded > 0 && (
              <p>{counts.excluded} row{counts.excluded === 1 ? '' : 's'} you excluded.</p>
            )}
            {result.failed > 0 && (
              <p className="text-critical">
                {result.failed} row{result.failed === 1 ? '' : 's'} could not be saved. Try importing those again.
              </p>
            )}
            {counts.errors > 0 && (
              <p>
                {counts.errors} row{counts.errors === 1 ? '' : 's'} had errors and were not imported.{' '}
                <button onClick={downloadErrorRows} className="text-brand-600 hover:underline font-medium">
                  Download them
                </button>
              </p>
            )}
          </div>

          <button
            onClick={reset}
            className="inline-flex items-center gap-2 px-4 py-2.5 text-sm font-medium text-brand-600 bg-brand-50 rounded-lg hover:bg-brand-100 transition-colors"
          >
            <FileUp size={16} /> Import another file
          </button>
        </div>
      )}
    </div>
  );
}

const Empty = () => <span className="text-ink-faint">—</span>;

/**
 * How much to trust a suggested column. Absent once the owner picks a column
 * themselves — at that point it's their answer, not our guess.
 */
const ConfidenceBadge = ({
  confidence,
  mapped,
}: { confidence?: MatchConfidence; mapped: boolean }) => {
  if (!confidence) return null;
  // The badge describes the column in the dropdown beside it, so the two can
  // never be allowed to disagree: no "Matched" over an empty select, and no
  // "Not found" over a real column.
  if (mapped !== (confidence !== 'none')) return null;

  const styles: Record<MatchConfidence, { label: string; className: string }> = {
    matched: { label: 'Matched', className: 'bg-positive-soft text-positive' },
    review: { label: 'Needs review', className: 'bg-caution-soft text-caution' },
    none: { label: 'Not found', className: 'bg-canvas text-ink-muted border border-line' },
  };
  const { label, className } = styles[confidence];

  return (
    <span className={`ml-2 px-1.5 py-0.5 rounded text-[10px] font-medium align-middle ${className}`}>
      {label}
    </span>
  );
};

/**
 * Shows a parsed date as unambiguous text so a wrong format choice is visible
 * before import, not months later.
 */
const DateCell = ({ iso, mapped }: { iso: string | null; mapped: boolean }) => {
  if (!mapped) return <Empty />;
  if (!iso) return <span className="text-critical text-xs">unreadable</span>;
  const parsed = parseImportDate(iso, 'YMD');
  return <span>{parsed ? formatDateForDisplay(parsed) : iso}</span>;
};

const Tile = ({ label, value, tone }: { label: string; value: number; tone: 'green' | 'amber' | 'red' | 'gray' }) => {
  const tones = {
    green: 'bg-positive-soft border-positive/20 text-positive',
    amber: 'bg-caution-soft border-caution/20 text-caution',
    red: 'bg-critical-soft border-critical/20 text-critical',
    gray: 'bg-canvas border-line text-ink-muted',
  } as const;

  return (
    <div className={`rounded-lg border p-3 ${value > 0 ? tones[tone] : 'bg-canvas border-line text-ink-faint'}`}>
      <p className="text-2xl font-semibold leading-none">{value}</p>
      <p className="text-xs mt-1">{label}</p>
    </div>
  );
};

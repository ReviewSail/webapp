import { useRef, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, Inbox as InboxIcon } from 'lucide-react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../context/AuthContext';

const states = ['New', 'In progress', 'Resolved'] as const;
type Status = (typeof states)[number];
type Report = {
  id: string;
  property: string;
  message: string;
  contact: string | null;
  reported: string;
  status: Status;
};
async function read(status: string | null, id: string | null, offset = 0) {
  const { data, error } = await supabase.rpc('stay_issue_inbox', {
    p_status: status,
    p_id: id,
    p_before: null,
    p_offset: offset,
  });
  if (error) throw error;
  return data as Report[];
}
export function StayIssueInbox() {
  const { session, accountId, scopeVersion } = useAuth();
  const scope = [session?.user.id, accountId, scopeVersion].join(':');
  return session && <ReportList key={scope} user={scope} />;
}
function ReportList({ user }: { user: string }) {
  const [params, setParams] = useSearchParams();
  const id = params.get('issue');
  const [filter, setFilter] = useState<Status>('New');
  const [page, setPage] = useState(0);
  const client = useQueryClient();
  const list = useQuery({
    queryKey: ['stayIssues', user, filter, page],
    queryFn: () => read(filter, null, page * 50),
    refetchInterval: 30000,
  });
  const detail = useQuery({
    queryKey: ['stayIssues', user, 'detail', id],
    queryFn: () => read(null, id),
    enabled: !!id,
    refetchInterval: 30000,
  });
  const select = (next: string | null) =>
    setParams((previous) => {
      const p = new URLSearchParams(previous);
      if (next) p.set('issue', next);
      else p.delete('issue');
      return p;
    });
  const item = detail.data?.[0];
  return (
    <section
      aria-label="Stay issues"
      className="overflow-hidden rounded-xl border border-line bg-card md:grid md:grid-cols-[minmax(15rem,2fr)_3fr]"
    >
      <div className={`${id ? 'hidden md:block' : ''} md:border-r md:border-line`}>
        <div className="flex flex-wrap gap-1 border-b border-line p-2">
          {states.map((state) => (
            <button
              key={state}
              aria-pressed={filter === state}
              onClick={() => {
                setFilter(state);
                setPage(0);
                select(null);
              }}
              className={`min-h-11 rounded-lg px-3 text-sm ${filter === state ? 'bg-brand-50 font-semibold text-brand-700' : 'text-ink-muted'}`}
            >
              {state}
            </button>
          ))}
        </div>
        <div className="max-h-[65vh] overflow-auto">
          {list.isError ? (
            <button className="p-4" onClick={() => void list.refetch()}>
              Couldn’t load reports. Retry
            </button>
          ) : list.isPending ? (
            <p role="status" className="p-4">
              Loading reports…
            </p>
          ) : list.data.length === 0 ? (
            <p className="p-5 text-sm text-ink-muted">No {filter.toLowerCase()} reports.</p>
          ) : (
            list.data.slice(0, 50).map((report) => (
              <button
                key={report.id}
                onClick={() => select(report.id)}
                aria-current={report.id === id}
                className={`block w-full border-b border-line p-4 text-left hover:bg-canvas ${report.id === id ? 'bg-brand-50' : ''}`}
              >
                <span className="block font-semibold">{report.property}</span>
                <span className="my-1 block line-clamp-2 break-words text-sm">
                  {report.message}
                </span>
                <time className="text-xs text-ink-muted">
                  {new Date(report.reported).toLocaleString()}
                </time>
              </button>
            ))
          )}
        </div>
        {(page > 0 || (list.data?.length ?? 0) > 50) && (
          <div className="flex justify-between p-3">
            <button disabled={!page} onClick={() => setPage(page - 1)}>
              Previous
            </button>
            <button disabled={(list.data?.length ?? 0) <= 50} onClick={() => setPage(page + 1)}>
              Next
            </button>
          </div>
        )}
      </div>
      <div className={`${!id ? 'hidden md:block' : ''} p-5 sm:p-7`}>
        {id ? (
          <>
            <button
              onClick={() => select(null)}
              className="mb-4 inline-flex min-h-11 items-center gap-2 text-sm text-brand-700"
            >
              <ArrowLeft size={16} />
              Back to reports
            </button>
            {detail.isError ? (
              <button onClick={() => void detail.refetch()}>Load report again</button>
            ) : detail.isPending ? (
              <p>Opening report…</p>
            ) : item ? (
              <ReportDetail
                key={item.id}
                report={item}
                refresh={() => client.invalidateQueries({ queryKey: ['stayIssues', user] })}
              />
            ) : (
              <p>This report is unavailable.</p>
            )}
          </>
        ) : (
          <div className="py-8 text-center text-ink-muted">
            <InboxIcon className="mx-auto mb-3" />
            <p>Select a guest report</p>
          </div>
        )}
      </div>
    </section>
  );
}
function ReportDetail({ report, refresh }: { report: Report; refresh: () => Promise<void> }) {
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const lock = useRef(false);
  async function update(next: string) {
    if (lock.current) return;
    lock.current = true;
    setSaving(true);
    setError('');
    try {
      const { data, error } = await supabase.rpc('set_stay_issue_status', {
        p_id: report.id,
        p_status: next,
      });
      if (error || !data) throw new Error();
      await refresh();
    } catch {
      setError('The status change could not be confirmed. Refresh and try again.');
    } finally {
      lock.current = false;
      setSaving(false);
    }
  }
  return (
    <div className="space-y-4">
      <h2 className="text-xl font-semibold">{report.property}</h2>
      <time className="text-sm text-ink-muted">{new Date(report.reported).toLocaleString()}</time>
      <p className="whitespace-pre-wrap break-words border-y border-line py-4">{report.message}</p>
      {report.contact && (
        <a
          className="block break-all text-brand-700 underline"
          href={(report.contact.includes('@') ? 'mailto:' : 'tel:') + report.contact}
        >
          {report.contact}
        </a>
      )}
      <label className="block text-sm font-medium">
        Report status{' '}
        <select
          className="ml-2 min-h-11 rounded-lg border border-line bg-card px-2"
          disabled={saving}
          value={report.status}
          onChange={(e) => void update(e.target.value)}
        >
          {states.map((state) => (
            <option key={state}>{state}</option>
          ))}
        </select>
      </label>
      {error && <p role="alert">{error}</p>}
    </div>
  );
}

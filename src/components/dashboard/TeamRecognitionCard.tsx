import { useState, useEffect } from 'react';
import { supabase } from '../../integrations/supabase/client';
import { useAuth } from '../../context/AuthContext';
import { MessageSquare, Quote, Clock } from 'lucide-react';
import { format } from 'date-fns';

interface RecognitionRecord {
  id: string;
  team_member_name: string | null;
  matched_role: string | null;
  matched_sentence: string;
  guest_name: string | null;
  source: string;
  created_at: string;
}

export function TeamRecognitionCard() {
  const { user } = useAuth();
  const [records, setRecords] = useState<RecognitionRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user) return;
    const fetchRecords = async () => {
      try {
        // Get account_id
        const { data: userData } = await supabase
          .from('users')
          .select('account_id')
          .eq('id', user.id)
          .single();
        if (!userData?.account_id) return;

        // Fetch recent 5 recognition records with team member names (if linked)
        const { data, error } = await supabase
          .from('recognition_records')
          .select(`
            id, matched_role, matched_sentence, guest_name, source, created_at,
            team_members ( name )
          `)
          .eq('account_id', userData.account_id)
          .order('created_at', { ascending: false })
          .limit(5);

        if (error) throw error;

        const mapped = (data || []).map((r: any) => ({
          id: r.id,
          team_member_name: r.team_members?.name ?? null,
          matched_role: r.matched_role,
          matched_sentence: r.matched_sentence,
          guest_name: r.guest_name,
          source: r.source,
          created_at: r.created_at,
        }));

        setRecords(mapped);
      } catch (err) {
        console.error('Failed to fetch recognition records:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchRecords();
  }, [user]);

  const timeAgo = (dateStr: string): string => {
    const now = new Date();
    const then = new Date(dateStr);
    const diffMs = now.getTime() - then.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHrs = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHrs < 24) return `${diffHrs}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    return `${diffDays} days ago`;
  };

  if (loading) {
    return (
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 animate-pulse">
        <div className="h-4 w-32 bg-slate-200 rounded mb-4"></div>
        <div className="space-y-3">
          <div className="h-8 bg-slate-100 rounded"></div>
          <div className="h-8 bg-slate-100 rounded"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
        <h2 className="text-lg font-bold text-slate-900 flex items-center">
          <MessageSquare className="h-5 w-5 mr-2 text-indigo-600" />
          Recent Recognition
        </h2>
      </div>

      {records.length === 0 ? (
        <div className="px-6 py-8 text-center space-y-2">
          <Quote className="h-6 w-6 text-slate-300 mx-auto" />
          <p className="text-sm text-slate-500 max-w-md mx-auto">
            Recognition moments from guest feedback will appear here once your team is mentioned positively — whether that’s a host, co-host, cleaner, or front desk.
          </p>
        </div>
      ) : (
        <div className="divide-y divide-slate-50">
          {records.map((record) => (
            <div key={record.id} className="px-6 py-4 space-y-2">
              <div className="flex items-start space-x-3">
                <Quote className="h-4 w-4 text-indigo-400 shrink-0 mt-0.5" />
                <div className="flex-1 min-w-0">
                  <p className="text-sm italic text-slate-700 line-clamp-3">
                    "{record.matched_sentence}"
                  </p>
                  <div className="flex items-center justify-between mt-2">
                    <div className="flex items-center space-x-2 text-xs text-slate-500">
                      {record.team_member_name ? (
                        <span className="font-semibold text-slate-800">{record.team_member_name}</span>
                      ) : (
                        <span className="font-semibold text-slate-800 capitalize">
                          {record.matched_role || 'Unknown'}
                        </span>
                      )}
                      {record.guest_name && (
                        <>
                          <span className="text-slate-300">·</span>
                          <span>from {record.guest_name}</span>
                        </>
                      )}
                    </div>
                    <div className="flex items-center text-xs text-slate-400">
                      <Clock className="h-3 w-3 mr-1" />
                      {timeAgo(record.created_at)}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { CheckCircle2, RefreshCw, AlertCircle } from 'lucide-react';

export default function AlreadyReviewed() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const requestId = searchParams.get('request_id');

  useEffect(() => {
    if (requestId) {
      handleAlreadyReviewed(requestId);
    }
  }, [requestId]);

  const handleAlreadyReviewed = async (id: string) => {
    setLoading(true);
    setError('');
    try {
      // Updates the status and logs the event in one call — guests hold no
      // direct grants on either table.
      const { error } = await supabase.rpc('record_request_event', {
        p_request_id: id,
        p_event: 'already_reviewed',
      });

      if (error) throw error;
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to process your request.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <RefreshCw className="h-8 w-8 animate-spin mx-auto text-indigo-600" />
          <p className="text-sm text-slate-600">Processing your request...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <AlertCircle className="h-8 w-8 mx-auto text-red-500" />
          <p className="text-sm text-red-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-md border border-slate-200 text-center">
        <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100 text-emerald-600">
          <CheckCircle2 className="h-8 w-8" />
        </div>
        <div>
          <h2 className="mt-4 text-2xl font-black text-slate-900">Already Reviewed!</h2>
          <p className="mt-2 text-sm text-slate-500 leading-relaxed">
            Thank you! We've noted that you've already shared your feedback and we won't bother you again about this visit.
          </p>
        </div>
      </div>
    </div>
  );
}
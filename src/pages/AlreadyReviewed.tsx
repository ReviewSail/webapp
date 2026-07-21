import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { CheckCircle2, RefreshCw, AlertCircle, Calendar } from 'lucide-react';

export default function AlreadyReviewed() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const requestId = searchParams.get('request_id');

  useEffect(() => {
    if (requestId) {
      processAlreadyReviewed(requestId);
    } else {
      setError('Invalid request link. No request ID was found.');
      setLoading(false);
    }
  }, [requestId]);

  const processAlreadyReviewed = async (id: string) => {
    try {
      // 1. Resolve guest contact information from review requests joined with customer email
      const { data, error: fetchErr } = await supabase
        .from('review_requests')
        .select(`
          id,
          orders (
            customers (
              email,
              phone
            )
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (fetchErr) throw fetchErr;

      // 2. Update request status to 'already_reviewed'
      const { error: updateErr } = await supabase
        .from('review_requests')
        .update({ status: 'already_reviewed' })
        .eq('id', id);

      if (updateErr) throw updateErr;

      // 3. Log a permanent opt-out block if guest contact email is found
      if (data) {
        const order = data.orders as any;
        const customer = order?.customers;
        const email = customer?.email;
        const phone = customer?.phone;

        if (email) {
          // Check if opt-out already exists
          const { data: existing } = await supabase
            .from('opt_outs')
            .select('id')
            .eq('email', email)
            .maybeSingle();

          if (!existing) {
            await supabase.from('opt_outs').insert({ email, phone: phone || null });
          }
        }
      }

      setSuccess(true);
    } catch (err: any) {
      console.error('[AlreadyReviewed] Processing failed:', err);
      setError(err?.message || 'Failed to process suppression. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center space-y-3">
          <RefreshCw className="h-8 w-8 text-indigo-600 animate-spin mx-auto" />
          <p className="text-xs font-semibold text-slate-500">Noting review preferences...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-2xl shadow-lg border border-slate-200 text-center">
        {success ? (
          <>
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100 text-emerald-600">
              <CheckCircle2 className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-2xl font-black text-slate-900 tracking-tight">Thank you!</h2>
              <p className="text-sm text-slate-600 leading-relaxed font-medium">
                We've noted your review and won't send any further messages.
              </p>
              <p className="text-xs text-slate-400 leading-relaxed pt-1.5 border-t border-slate-100 mt-2">
                Your feedback has been valuable to us. Your email has been added to our suppressed directory to protect your inbox from any automatic follow-up reminders.
              </p>
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-red-100 text-red-600">
              <AlertCircle className="h-8 w-8" />
            </div>
            <div className="space-y-2">
              <h2 className="text-xl font-bold text-slate-900 tracking-tight">Processing Error</h2>
              <p className="text-xs text-slate-600 leading-relaxed">
                {error || 'An unexpected error occurred. We could not register your proactive review submission.'}
              </p>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
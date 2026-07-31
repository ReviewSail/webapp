import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';

/**
 * Opting out is now authorised by the request id in the link rather than by a
 * contact detail typed into a form. The old page inserted whatever `?email=`
 * or `?phone=` contained, with no token of any kind — so anyone could
 * unsubscribe anyone, or walk the whole guest list. The address is derived
 * server-side by submit_opt_out, which means a caller can only ever opt out
 * the guest whose link they actually hold.
 */
export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const [loading, setLoading] = useState(true);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const requestId = searchParams.get('request_id');

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError(
        'This unsubscribe link is missing its reference. Please use the link from your most recent message, or reply STOP to any text.',
      );
      return;
    }

    const unsubscribe = async () => {
      try {
        // Phone opt-outs are honoured by the send loop alongside email; the RPC
        // records whichever of the two the guest's record carries.
        const { error } = await supabase.rpc('submit_opt_out', {
          p_request_id: requestId,
        });
        if (error) throw error;
        setSuccess(true);
      } catch (err: any) {
        console.error(err);
        setError(err.message || 'An error occurred while unsubscribing.');
      } finally {
        setLoading(false);
      }
    };

    unsubscribe();
  }, [requestId]);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="animate-pulse flex flex-col items-center space-y-2">
            <div className="h-10 w-10 bg-indigo-100 rounded-full"></div>
            <div className="h-4 w-32 bg-slate-100 rounded"></div>
          </div>
          <p className="text-sm text-slate-500">Processing unsubscribe request...</p>
        </div>
      </div>
    );
  }

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-green-100">
            <svg className="h-6 w-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="M5 13l4 4L19 7" />
            </svg>
          </div>
          <h2 className="mt-4 text-2xl font-extrabold text-slate-900">Unsubscribed</h2>
          {/* The address is never sent to the browser, so it cannot be echoed
              back here — which is the point: the page can act on the guest's
              contact details without ever exposing them. */}
          <p className="mt-2 text-sm text-slate-600">
            You have been unsubscribed from all future review requests.
          </p>
        </div>
      </div>
    );
  }

  // Anything that is not "loading" or "done" is a link problem. There is no
  // manual form any more: a page that accepts a typed-in address is exactly the
  // hole this change closes.
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl shadow-sm border border-slate-200 text-center">
        <h2 className="text-2xl font-extrabold text-slate-900">Unsubscribe</h2>
        <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200">
          {error || 'We could not process this unsubscribe link.'}
        </div>
        <p className="text-xs text-slate-400">
          You can also reply STOP to any text message to opt out of SMS.
        </p>
      </div>
    </div>
  );
}
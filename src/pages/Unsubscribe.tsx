import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';

export default function Unsubscribe() {
  const [searchParams] = useSearchParams();
  const [email, setEmail] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');

  const emailParam = searchParams.get('email');

  useEffect(() => {
    if (emailParam) {
      setEmail(emailParam);
      // Auto-submit if email is in URL
      handleUnsubscribe(emailParam);
    }
  }, [emailParam]);

  const handleUnsubscribe = async (targetEmail: string) => {
    setLoading(true);
    setError('');
    try {
      const { error } = await supabase.from('opt_outs').insert({ email: targetEmail });
      if (error) throw error;
      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'An error occurred while unsubscribing.');
    } finally {
      setLoading(false);
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (email) {
      handleUnsubscribe(email);
    }
  };

  if (loading && !success) {
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
          <p className="mt-2 text-sm text-slate-600">
            The email <strong className="text-slate-800">{email}</strong> has been unsubscribed from all future review requests.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-xl shadow-sm border border-slate-200">
        <div>
          <h2 className="mt-6 text-center text-3xl font-extrabold text-slate-900">
            Unsubscribe
          </h2>
          <p className="mt-2 text-center text-sm text-slate-600">
            Enter your email to opt out of future review requests.
          </p>
        </div>
        <form className="mt-8 space-y-6" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 text-red-700 p-3 rounded-md text-sm border border-red-200">
              {error}
            </div>
          )}
          
          <div className="rounded-md shadow-sm -space-y-px">
            <div>
              <label htmlFor="email-address" className="sr-only">Email address</label>
              <input 
                id="email-address" 
                name="email" 
                type="email" 
                required 
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="appearance-none rounded-md relative block w-full px-3 py-2 border border-slate-300 placeholder-slate-500 text-slate-900 focus:outline-none focus:ring-indigo-500 focus:border-indigo-500 focus:z-10 sm:text-sm" 
                placeholder="Email address" 
              />
            </div>
          </div>

          <div>
            <button 
              type="submit" 
              disabled={loading || !email}
              className="group relative w-full flex justify-center py-2 px-4 border border-transparent text-sm font-medium rounded-md text-white bg-slate-900 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-slate-900 disabled:opacity-50"
            >
              {loading ? 'Processing...' : 'Confirm Unsubscribe'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
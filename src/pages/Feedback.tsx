import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Star, MessageSquare, CheckCircle2, MapPin, Sparkles, Send } from 'lucide-react';

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const [requestId, setRequestId] = useState<string | null>(null);
  const [rating, setRating] = useState<number>(5);
  const [comment, setComment] = useState<string>('');
  const [hoverRating, setHoverRating] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);
  const [error, setError] = useState('');
  const [locationName, setLocationName] = useState('Our Property');
  const [googleUrl, setGoogleUrl] = useState('');

  const reqIdParam = searchParams.get('request_id');

  useEffect(() => {
    if (reqIdParam) {
      setRequestId(reqIdParam);
      fetchRequestDetails(reqIdParam);
    }
  }, [reqIdParam]);

  const fetchRequestDetails = async (id: string) => {
    try {
      const { data, error } = await supabase
        .from('review_requests')
        .select(`
          id,
          orders (
            locations (
              name,
              google_place_url
            )
          )
        `)
        .eq('id', id)
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const order = data.orders as any;
        const location = order?.locations;
        if (location) {
          setLocationName(location.name || 'Our Property');
          setGoogleUrl(location.google_place_url || '');
        }
      }
    } catch (err) {
      console.error('Failed to resolve request details:', err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError('');

    try {
      const { error: dbError } = await supabase
        .from('feedback')
        .insert({
          request_id: requestId || null,
          rating,
          comment: comment.trim() || null
        });

      if (dbError) throw dbError;

      // Unconditionally trigger message event log for clicked/submitted action
      if (requestId) {
        await supabase.from('message_events').insert({
          request_id: requestId,
          event_type: 'clicked'
        });
        
        await supabase.from('review_requests').update({
          status: 'clicked'
        }).eq('id', requestId);
      }

      setSuccess(true);
    } catch (err: any) {
      console.error(err);
      setError(err.message || 'Failed to submit feedback. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-8 bg-white p-8 rounded-2xl shadow-md border border-slate-200 text-center">
          <div className="mx-auto flex items-center justify-center h-14 w-14 rounded-full bg-emerald-100 text-emerald-600">
            <CheckCircle2 className="h-8 w-8" />
          </div>
          <div>
            <h2 className="mt-4 text-2xl font-black text-slate-900">Feedback Submitted!</h2>
            <p className="mt-2 text-sm text-slate-500 leading-relaxed">
              Thank you for sharing your private review with us. Your insights help our team continuously improve our experiences.
            </p>
          </div>

          {googleUrl && (
            <div className="bg-gradient-to-r from-indigo-50 to-indigo-100/50 p-5 rounded-xl border border-indigo-100 text-center space-y-3">
              <Sparkles className="h-5 w-5 text-indigo-600 mx-auto" />
              <p className="text-xs font-semibold text-slate-700">Would you mind sharing your review publicly on Google too?</p>
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-semibold text-xs py-2 px-4 rounded-lg shadow-sm transition-colors"
              >
                <span>Write a Google Review</span>
                <Star className="h-3.5 w-3.5 fill-white text-white" />
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full bg-white p-8 rounded-2xl shadow-lg border border-slate-200 space-y-6">
        <div className="text-center">
          <h1 className="text-2xl font-black text-slate-900 tracking-tight">Share Your Experience</h1>
          <p className="text-sm text-slate-500 mt-1 flex items-center justify-center">
            <MapPin className="h-4 w-4 text-indigo-600 mr-1 shrink-0" />
            <span>{locationName}</span>
          </p>
        </div>

        {error && (
          <div className="bg-red-50 text-red-700 p-3.5 rounded-xl text-xs border border-red-200">
            {error}
          </div>
        )}

        {/* Unconditional Google Review Shortcut */}
        {googleUrl && (
          <div className="bg-indigo-50/60 p-4 rounded-xl border border-indigo-100 text-center space-y-2">
            <p className="text-xs text-slate-600 font-medium">Want to publish your rating directly to Google Maps right now?</p>
            <a
              href={googleUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center space-x-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-xs py-1.5 px-3.5 rounded-lg transition-colors shadow-sm"
            >
              <span>Go straight to Google Review</span>
              <Star className="h-3.5 w-3.5 fill-white text-white" />
            </a>
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Star selector */}
          <div className="space-y-2 text-center">
            <label className="block text-sm font-semibold text-slate-700">How would you rate your stay?</label>
            <div className="flex items-center justify-center space-x-1.5 pt-1">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  type="button"
                  onClick={() => setRating(star)}
                  onMouseEnter={() => setHoverRating(star)}
                  onMouseLeave={() => setHoverRating(null)}
                  className="p-1 hover:scale-110 transition-transform"
                >
                  <Star
                    className={`h-9 w-9 ${
                      star <= (hoverRating ?? rating)
                        ? 'fill-amber-400 text-amber-400'
                        : 'text-slate-300'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment Box */}
          <div className="space-y-1.5">
            <label className="block text-sm font-semibold text-slate-700 flex items-center">
              <MessageSquare className="h-4 w-4 text-slate-400 mr-1.5" />
              <span>Private Feedback Message</span>
            </label>
            <p className="text-[11px] text-slate-500 leading-relaxed">This message goes directly and confidentially to our management team.</p>
            <textarea
              rows={4}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="Tell us what went well, or how we could have made your experience better..."
              className="w-full text-sm rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 py-2.5 px-3 border bg-white"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading}
            className="w-full bg-slate-900 text-white hover:bg-slate-800 text-sm font-bold py-2.5 px-4 rounded-xl shadow-sm transition-colors flex items-center justify-center space-x-1.5 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{loading ? 'Submitting...' : 'Submit Confidential Review'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
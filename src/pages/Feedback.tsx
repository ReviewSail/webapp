import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Star, MessageSquare, CheckCircle2, MapPin, Send } from 'lucide-react';

export default function Feedback() {
  const [searchParams] = useSearchParams();
  const [requestId, setRequestId] = useState<string | null>(null);
  // No default. Pre-selecting 5 meant a guest who typed a complaint and hit
  // send without touching the stars was recorded as a 5-star rating, which fed
  // straight into the dashboard average.
  const [rating, setRating] = useState<number | null>(null);
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
      // See FeedbackGate: anon reads this context through an RPC, not a join.
      const { data, error } = await supabase
        .rpc('get_feedback_gate_context', { p_request_id: id })
        .maybeSingle();

      if (error) throw error;
      if (data) {
        const location = data as { location_name: string | null; google_place_url: string | null };
        setLocationName(location.location_name || 'Our Property');
        setGoogleUrl(location.google_place_url || '');
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
      // Previously inserted directly, with request_id allowed to be null — this
      // page could write orphan rows with no token at all. The RPC requires a
      // valid request and derives everything else, so the id is now mandatory.
      if (!requestId) {
        setError('This feedback link is missing its request reference.');
        return;
      }

      if (rating === null) {
        setError('Please choose a star rating first.');
        return;
      }

      const { error: dbError } = await supabase.rpc('submit_guest_feedback', {
        p_request_id: requestId,
        p_star_rating: rating,
        p_feedback_text: comment.trim() || null,
      });

      if (dbError) throw dbError;

      // Marks the request clicked and logs the event in one call.
      if (requestId) {
        await supabase.rpc('record_request_event', {
          p_request_id: requestId,
          p_event: 'clicked',
        });
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
    // The star gate, applied where it belongs: only a guest who enjoyed the
    // stay is pointed at the public review page. Everyone else gets a promise
    // that a person will read what they wrote.
    const isHappy = rating !== null && rating >= 4;

    return (
      <div className="min-h-screen flex items-center justify-center bg-canvas py-12 px-4 sm:px-6 lg:px-8">
        <div className="max-w-md w-full space-y-6 bg-white p-8 rounded-xl border border-line text-center">
          <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-positive-soft text-positive">
            <CheckCircle2 className="h-6 w-6" />
          </div>
          <div>
            <h2 className="text-xl font-semibold tracking-[-0.02em] text-ink">Thank you</h2>
            <p className="mt-2 text-sm text-ink-muted leading-relaxed">
              {isHappy
                ? `Your feedback has gone straight to the team at ${locationName}.`
                : `Your feedback has gone straight to the team at ${locationName}. Someone will read it personally, and they may be in touch.`}
            </p>
          </div>

          {googleUrl && isHappy && (
            <div className="rounded-xl border border-line bg-canvas p-5 text-center space-y-3">
              <p className="text-sm text-ink">
                Glad you enjoyed it. Would you share that on Google?
              </p>
              <a
                href={googleUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 rounded-lg bg-brand-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-brand-700 active:bg-brand-800"
              >
                <span>Write a Google review</span>
                <Star className="h-3.5 w-3.5 fill-white text-white" />
              </a>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-canvas py-12 px-4 sm:px-6 lg:px-8">
      <div className="max-w-lg w-full bg-white p-8 rounded-xl border border-line space-y-6">
        <div className="text-center">
          <h1 className="text-xl font-semibold tracking-[-0.02em] text-ink">How was your stay?</h1>
          <p className="text-sm text-ink-muted mt-1 flex items-center justify-center">
            <MapPin className="h-4 w-4 text-ink-faint mr-1 shrink-0" />
            <span>{locationName}</span>
          </p>
        </div>

        {error && (
          <div className="bg-critical-soft text-critical p-3.5 rounded-lg text-xs border border-critical/20">
            {error}
          </div>
        )}

        {/*
          There used to be an unconditional "Go straight to Google Review"
          button here, shown before the guest had rated anything — and every
          invite and reminder email links to this page. It routed around the
          star gate that is the entire point of the product: an unhappy guest
          could be one click from a public one-star review.

          The Google link now appears only after submission, and only for guests
          who rated the stay well. See the success view above.
        */}
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Star selector */}
          <div className="space-y-2 text-center">
            <label className="block text-sm font-medium text-ink">Your rating</label>
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
                    className={`h-9 w-9 transition-colors ${
                      star <= (hoverRating ?? rating ?? 0)
                        ? 'fill-star text-star'
                        : 'text-line'
                    }`}
                  />
                </button>
              ))}
            </div>
          </div>

          {/* Comment Box */}
          <div className="space-y-1.5">
            <label htmlFor="guest-comment" className="text-sm font-medium text-ink flex items-center">
              <MessageSquare className="h-4 w-4 text-ink-faint mr-1.5" />
              <span>Tell us more</span>
            </label>
            <p className="text-xs text-ink-muted leading-relaxed">
              This goes privately to the management team — it is not published anywhere.
            </p>
            <textarea
              id="guest-comment"
              rows={4}
              required
              value={comment}
              onChange={(e) => setComment(e.target.value)}
              placeholder="What went well, or what would have made it better?"
              className="w-full text-sm rounded-lg border border-line bg-white py-2.5 px-3 text-ink placeholder:text-ink-faint focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500"
            />
          </div>

          {/* Submit */}
          <button
            type="submit"
            disabled={loading || rating === null}
            className="w-full bg-brand-600 text-white hover:bg-brand-700 active:bg-brand-800 text-sm font-medium py-2.5 px-4 rounded-lg transition-colors flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Send className="h-4 w-4" />
            <span>{loading ? 'Sending…' : 'Send feedback'}</span>
          </button>
        </form>
      </div>
    </div>
  );
}
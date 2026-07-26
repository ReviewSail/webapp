import { useState, useEffect } from 'react';
import { useSearchParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Star, Send, CheckCircle2, MapPin, Mail, MessageCircle } from 'lucide-react';

export default function FeedbackGate() {
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request_id');
  const [locationName, setLocationName] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
  const [locationId, setLocationId] = useState('');
  const [selectedStars, setSelectedStars] = useState<number | null>(null);
  const [showPrivateForm, setShowPrivateForm] = useState(false);
  const [feedbackText, setFeedbackText] = useState('');
  const [guestName, setGuestName] = useState('');
  const [guestEmail, setGuestEmail] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');
  const [isDemo, setIsDemo] = useState(false);

  // Recovery section state
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [lowRatingSubmitted, setLowRatingSubmitted] = useState(false);
  const [recoveryMessage, setRecoveryMessage] = useState('');
  const [recoveryName, setRecoveryName] = useState('');
  const [recoveryGuestEmail, setRecoveryGuestEmail] = useState('');
  const [recoverySubmitting, setRecoverySubmitting] = useState(false);
  const [recoverySubmitted, setRecoverySubmitted] = useState(false);

  useEffect(() => {
    if (!requestId) {
      setLoading(false);
      setError('Missing request ID.');
      return;
    }

    // Demo mode: show gate with placeholder data
    if (requestId === 'demo') {
      setIsDemo(true);
      setLocationName('The Grand Hotel');
      setGoogleUrl('');
      setLocationId('');
      setRecoveryEmail('recovery@grandhotel.com');
      setLoading(false);
      return;
    }

    // Fetch request details: location name, google_place_url, location_id, recovery_email
    const fetchDetails = async () => {
      try {
        const { data, error } = await supabase
          .from('review_requests')
          .select(`
            id,
            orders (
              checkout_date,
              locations (
                id,
                name,
                google_place_url,
                recovery_email
              )
            )
          `)
          .eq('id', requestId)
          .maybeSingle();

        if (error || !data) throw error || new Error('Request not found');

        const order = data.orders as any;
        const location = order?.locations;
        if (location) {
          setLocationName(location.name || 'Our Property');
          setGoogleUrl(location.google_place_url || '');
          setLocationId(location.id);
          setRecoveryEmail(location.recovery_email || '');
        }
      } catch (err: any) {
        console.error(err);
        setError('Unable to load request details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [requestId]);

  // Log click event (skip for demo)
  useEffect(() => {
    if (requestId && !loading && !isDemo) {
      supabase.from('message_events').insert({
        request_id: requestId,
        event_type: 'clicked',
      }).then(() => {
        supabase.from('review_requests').update({ status: 'clicked' }).eq('id', requestId);
      }).catch((err: any) => console.error(err));
    }
  }, [requestId, loading, isDemo]);

  const handleStarSelect = async (rating: number) => {
    setSelectedStars(rating);

    if (rating >= 4) {
      // Happy guest: redirect to Google (skip for demo)
      if (!isDemo) {
        await supabase.from('review_requests').update({ status: 'clicked' }).eq('id', requestId);
      }
      if (googleUrl) {
        window.location.href = googleUrl;
      } else {
        // Fallback: show a thank-you message
        setSubmitted(true);
      }
    } else {
      // Unhappy guest: show private feedback form
      setShowPrivateForm(true);
    }
  };

  const handleSubmitPrivateFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackText.trim() || !selectedStars) return;
    setSubmitting(true);
    setError('');

    try {
      if (!isDemo) {
        const { error } = await supabase.from('private_feedback').insert({
          request_id: requestId || null,
          location_id: locationId || null,
          star_rating: selectedStars,
          feedback_text: feedbackText.trim(),
          guest_name: guestName.trim() || null,
          guest_email: guestEmail.trim() || null,
          is_read: false,
        });

        if (error) throw error;

        // Update review request status
        await supabase.from('review_requests').update({ status: 'private_feedback' }).eq('id', requestId);
      } else {
        // Demo mode: simulate a brief delay
        await new Promise(r => setTimeout(r, 500));
      }

      setSubmitted(true);
      setLowRatingSubmitted(true);
    } catch (err: any) {
      console.error(err);
      setError('Failed to submit feedback. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSubmitRecoveryMessage = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!recoveryMessage.trim()) return;
    setRecoverySubmitting(true);

    try {
      if (!isDemo) {
        const { error } = await supabase.from('private_feedback').insert({
          request_id: requestId || null,
          location_id: locationId || null,
          star_rating: null,
          feedback_text: recoveryMessage.trim(),
          guest_name: recoveryName.trim() || null,
          guest_email: recoveryGuestEmail.trim() || null,
          is_read: false,
        });

        if (error) throw error;
      } else {
        await new Promise(r => setTimeout(r, 500));
      }

      setRecoverySubmitted(true);
    } catch (err: any) {
      console.error(err);
      setError('Failed to send your message. Please try again or email us directly.');
    } finally {
      setRecoverySubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50">
        <div className="animate-pulse flex flex-col items-center space-y-2">
          <div className="h-10 w-10 bg-indigo-200 rounded-full"></div>
          <div className="h-4 w-32 bg-indigo-100 rounded"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50 px-4">
        <div className="text-center max-w-md">
          <p className="text-slate-600">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-b from-slate-50 to-indigo-50 px-4 py-12">
      <div className="w-full max-w-lg mx-auto">
        {isDemo && (
          <div className="text-center mb-4">
            <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold bg-amber-100 text-amber-800 border border-amber-200">
              Preview Mode — Demo Data
            </span>
          </div>
        )}
        
        {!showPrivateForm && !submitted && (
          /* Initial star rating screen */
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-10 text-center space-y-6">
            <div className="flex justify-center">
              <div className="bg-indigo-50 p-3 rounded-full">
                <MapPin className="h-8 w-8 text-indigo-600" />
              </div>
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">How was your stay at</h1>
              <p className="text-lg font-semibold text-indigo-600 mt-1">{locationName || 'our property'}?</p>
            </div>
            <p className="text-sm text-slate-500">Tap a star to rate your experience</p>

            <div className="flex items-center justify-center space-x-2 pt-2">
              {[1, 2, 3, 4, 5].map((star) => (
                <button
                  key={star}
                  onClick={() => handleStarSelect(star)}
                  className="p-2 hover:scale-110 transition-transform"
                  aria-label={`Rate ${star} star${star > 1 ? 's' : ''}`}
                >
                  <Star className="h-12 w-12 sm:h-14 sm:w-14 text-slate-300 hover:text-amber-400 transition-colors" />
                </button>
              ))}
            </div>

            <div className="flex justify-between text-xs text-slate-400 px-4">
              <span>Poor</span>
              <span>Great</span>
            </div>
          </div>
        )}

        {showPrivateForm && !submitted && selectedStars && selectedStars <= 3 && (
          /* Private feedback form for 1-3 stars */
          <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-10 space-y-6">
            <div className="text-center">
              <div className="flex justify-center mb-3">
                <div className="flex space-x-1">
                  {[1, 2, 3, 4, 5].map((star) => (
                    <Star
                      key={star}
                      className={`h-8 w-8 ${
                        star <= selectedStars ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                      }`}
                    />
                  ))}
                </div>
              </div>
              <h2 className="text-xl font-bold text-slate-900">We're sorry to hear that</h2>
              <p className="text-sm text-slate-500 mt-1">What could we have done better?</p>
            </div>

            <form onSubmit={handleSubmitPrivateFeedback} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Your feedback (required)</label>
                <textarea
                  rows={4}
                  required
                  value={feedbackText}
                  onChange={(e) => setFeedbackText(e.target.value)}
                  placeholder="Tell us what went wrong..."
                  className="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Your name (optional)</label>
                  <input
                    type="text"
                    value={guestName}
                    onChange={(e) => setGuestName(e.target.value)}
                    placeholder="Jane Smith"
                    className="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Email (optional)</label>
                  <input
                    type="email"
                    value={guestEmail}
                    onChange={(e) => setGuestEmail(e.target.value)}
                    placeholder="guest@example.com"
                    className="w-full rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                  />
                </div>
              </div>

              {error && (
                <div className="bg-red-50 text-red-700 p-3 rounded-xl text-xs border border-red-200">
                  {error}
                </div>
              )}

              <button
                type="submit"
                disabled={submitting || !feedbackText.trim()}
                className="w-full bg-slate-900 text-white font-semibold py-3 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
              >
                <Send className="h-4 w-4" />
                <span>{submitting ? 'Submitting...' : 'Submit Private Feedback'}</span>
              </button>
            </form>
          </div>
        )}

        {submitted && (
          /* Thank-you screen */
          <div className="space-y-0">
            <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-8 sm:p-10 text-center space-y-6">
              <div className="mx-auto flex items-center justify-center h-16 w-16 rounded-full bg-emerald-100 text-emerald-600">
                <CheckCircle2 className="h-8 w-8" />
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-900">Thank you!</h2>
                <p className="text-sm text-slate-500 mt-2 leading-relaxed">
                  Your feedback has been received. Our team will review it and work to improve.
                </p>
              </div>
            </div>

            {/* Recovery section — shown only for 1-3 star submitters when recovery email is configured */}
            {lowRatingSubmitted && recoveryEmail && !recoverySubmitted && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8 space-y-5">
                  <div className="text-center">
                    <p className="text-xs text-slate-500 leading-relaxed">
                      We're sorry your stay didn't meet expectations. We'd love the chance to make it right.
                    </p>
                  </div>

                  {/* Email CTA */}
                  <a
                    href={`mailto:${recoveryEmail}`}
                    className="flex items-center justify-center space-x-2 w-full border border-slate-200 text-slate-600 hover:bg-slate-50 font-semibold text-sm py-2.5 px-4 rounded-xl transition-colors"
                  >
                    <Mail className="h-4 w-4" />
                    <span>Contact the hotel directly</span>
                  </a>

                  {/* Divider with "or" */}
                  <div className="flex items-center space-x-3">
                    <div className="flex-1 h-px bg-slate-100" />
                    <span className="text-xs text-slate-400 font-medium">or send us a message directly</span>
                    <div className="flex-1 h-px bg-slate-100" />
                  </div>

                  {/* Direct message form */}
                  <form onSubmit={handleSubmitRecoveryMessage} className="space-y-3">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Your name (optional)</label>
                        <input
                          type="text"
                          value={recoveryName}
                          onChange={(e) => setRecoveryName(e.target.value)}
                          placeholder="Jane Smith"
                          className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-medium text-slate-500 mb-1">Email (optional)</label>
                        <input
                          type="email"
                          value={recoveryGuestEmail}
                          onChange={(e) => setRecoveryGuestEmail(e.target.value)}
                          placeholder="guest@example.com"
                          className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-slate-500 mb-1">Message (required)</label>
                      <textarea
                        rows={3}
                        required
                        value={recoveryMessage}
                        onChange={(e) => setRecoveryMessage(e.target.value)}
                        placeholder="Tell us how we can make things right..."
                        className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2 px-3 border bg-white"
                      />
                    </div>
                    <button
                      type="submit"
                      disabled={recoverySubmitting || !recoveryMessage.trim()}
                      className="w-full bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
                    >
                      <MessageCircle className="h-4 w-4" />
                      <span>{recoverySubmitting ? 'Sending...' : 'Send Message'}</span>
                    </button>
                  </form>
                </div>
              </div>
            )}

            {/* Recovery submitted success state */}
            {lowRatingSubmitted && recoveryEmail && recoverySubmitted && (
              <div className="mt-6 pt-6 border-t border-slate-100">
                <div className="bg-white rounded-3xl shadow-xl border border-slate-100 p-6 sm:p-8 text-center space-y-4">
                  <div className="mx-auto flex items-center justify-center h-12 w-12 rounded-full bg-indigo-100 text-indigo-600">
                    <CheckCircle2 className="h-6 w-6" />
                  </div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-900">Message Sent</h3>
                    <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                      Your message has been delivered to the hotel. A team member will follow up with you soon.
                    </p>
                  </div>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

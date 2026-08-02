import { useState, useEffect } from 'react';
import { useSearchParams, useParams } from 'react-router-dom';
import { supabase } from '../integrations/supabase/client';
import { Star, Send, CheckCircle2, MapPin, Mail, MessageCircle } from 'lucide-react';
import { decodeShortId } from '../lib/shortLink';

/**
 * 'request' — the guest was sent here, so a stay already exists and everything
 * keys off its request id.
 *
 * 'property' — the guest scanned a poster. There is no stay yet: the code is a
 * location, and the stay is created when they submit. Same gate, same UI; only
 * the identity and the RPCs behind it differ.
 */
type GateMode = 'request' | 'property';

export default function FeedbackGate({ mode = 'request' }: { mode?: GateMode }) {
  const [searchParams] = useSearchParams();
  // Reached as /feedback-gate?request_id=<uuid> (email, and any link already
  // sent), /r/<code> (SMS, where the long URL costs a segment), or /p/<code>
  // (a property QR). Codes are indistinguishable once encoded, so the route
  // decides which kind of id this is.
  const { code } = useParams<{ code?: string }>();
  const isProperty = mode === 'property';

  const propertyId = isProperty && code ? decodeShortId(code) : null;
  const requestId = isProperty
    ? null
    : searchParams.get('request_id') ?? (code ? decodeShortId(code) : null);

  /** Whichever id this gate is keyed on — used for load and submit guards. */
  const gateId = isProperty ? propertyId : requestId;
  const [locationName, setLocationName] = useState('');
  const [googleUrl, setGoogleUrl] = useState('');
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
    if (!gateId) {
      setLoading(false);
      setError(isProperty ? 'This link is not valid.' : 'Missing request ID.');
      return;
    }

    // Demo mode: show gate with placeholder data
    if (gateId === 'demo') {
      setIsDemo(true);
      setLocationName('The Grand Hotel');
      setGoogleUrl('');
      setRecoveryEmail('recovery@grandhotel.com');
      setLoading(false);
      return;
    }

    // Fetch request details: location name, google_place_url, location_id, recovery_email
    const fetchDetails = async () => {
      try {
        // Read via RPC rather than a nested join: anon holds no grant on
        // locations/orders, and this keeps request_ids non-enumerable.
        const { data, error } = await (isProperty
          ? supabase.rpc('get_property_gate_context', { p_location_id: propertyId })
          : supabase.rpc('get_feedback_gate_context', { p_request_id: requestId })
        ).maybeSingle();

        if (error) throw error;
        if (!data) throw new Error(isProperty ? 'Property not found' : 'Request not found');

        const location = data as {
          location_id: string;
          location_name: string | null;
          google_place_url: string | null;
          recovery_email: string | null;
        };

        setLocationName(location.location_name || 'Our Property');
        setGoogleUrl(location.google_place_url || '');
        setRecoveryEmail(location.recovery_email || '');
      } catch (err: any) {
        console.error(err);
        setError(isProperty ? 'Unable to load this property.' : 'Unable to load request details.');
      } finally {
        setLoading(false);
      }
    };

    fetchDetails();
  }, [gateId, isProperty, propertyId, requestId]);

  // Log click event (skip for demo). Property scans have no request to update
  // yet — one is created when they submit.
  useEffect(() => {
    if (!isProperty && requestId && !loading && !isDemo) {
      const recordEvent = async () => {
        // One RPC updates the status and logs the event; guests hold no direct
        // table grants, so request_ids can't be enumerated.
        const { error } = await supabase.rpc('record_request_event', {
          p_request_id: requestId,
          p_event: 'clicked',
        });
        if (error) console.error('Failed to record click:', error);
      };
      recordEvent();
    }
  }, [requestId, loading, isDemo]);

  /**
   * One submission, routed to whichever RPC this gate is keyed on. Both derive
   * the location and the feedback kind server-side, so a guest can never file
   * against another property or relabel a complaint as a rating.
   */
  const submitFeedback = (args: {
    star: number | null;
    text?: string | null;
    name?: string | null;
    email?: string | null;
  }) =>
    isProperty
      ? supabase.rpc('submit_property_feedback', {
          p_location_id: propertyId,
          p_star_rating: args.star,
          p_feedback_text: args.text ?? null,
          p_guest_name: args.name ?? null,
          p_guest_email: args.email ?? null,
        })
      : supabase.rpc('submit_guest_feedback', {
          p_request_id: requestId,
          p_star_rating: args.star,
          p_feedback_text: args.text ?? null,
          p_guest_name: args.name ?? null,
          p_guest_email: args.email ?? null,
        });

  const handleStarSelect = async (rating: number) => {
    setSelectedStars(rating);

    if (rating >= 4) {
      if (!isDemo) {
        // Record the rating before handing off to Google. Without this, happy
        // guests leave no trace at all and the dashboard average — computed
        // from this data — can never rise above 3.
        //
        // Note: supabase-js builders are lazy thenables, so `.then()` is what
        // actually issues the request. Calling it (rather than awaiting) is
        // what keeps the redirect instant while still firing the write — a lost
        // statistic is cheap, a delayed redirect costs the review itself.
        submitFeedback({ star: rating }).then(({ error }) => {
          if (error) console.error('Failed to record rating:', error);
        });

        // A property scan has no request to mark clicked — submit_property_feedback
        // creates one already in that state.
        if (!isProperty) {
          supabase
            .rpc('record_request_event', { p_request_id: requestId, p_event: 'clicked' })
            .then(({ error }) => {
              if (error) console.error('Failed to mark request clicked:', error);
            });
        }
      }

      if (googleUrl) {
        window.location.href = googleUrl;
      } else {
        // No review URL configured for this property — the happy guest has
        // nowhere to go, so at least thank them and keep the rating.
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
        // location_id is deliberately not sent: the RPC derives it from the
        // request, so a guest cannot file a complaint against another property.
        const { error } = await submitFeedback({
          star: selectedStars,
          text: feedbackText.trim(),
          name: guestName.trim() || null,
          email: guestEmail.trim() || null,
        });

        if (error) throw error;

        // Update review request status. Property scans skip this: the request
        // is created as 'private_feedback' in the same call above.
        if (!isProperty) {
          await supabase.rpc('record_request_event', {
            p_request_id: requestId,
            p_event: 'private_feedback',
          });
        }
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
        // No star rating: the RPC files this as a 'recovery' message.
        const { error } = await submitFeedback({
          star: null,
          text: recoveryMessage.trim(),
          name: recoveryName.trim() || null,
          email: recoveryGuestEmail.trim() || null,
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

import { useState, useCallback, useRef } from 'react';
import { supabase } from '../integrations/supabase/client';
import { useReviewSail } from '../context/ReviewSailContext';
import { Sparkles, Copy, RotateCcw, RefreshCw, AlertCircle, CheckCircle, FileText } from 'lucide-react';

const REVIEW_TOPICS = [
  { value: '5-star-comments', label: '5-star with comments' },
  { value: '5-star-no-text', label: '5-star no text' },
  { value: 'staff-praise', label: 'Staff praise' },
  { value: 'cleanliness-praise', label: 'Cleanliness praise' },
  { value: 'location-amenities', label: 'Location / amenities praise' },
  { value: '3-star-mixed', label: '3-star mixed review' },
  { value: 'cleanliness-complaint', label: 'Cleanliness complaint' },
  { value: 'noise-complaint', label: 'Noise complaint' },
  { value: 'service-complaint', label: 'Service complaint' },
  { value: 'inaccurate-unfair', label: 'Inaccurate / unfair review' },
];

const TONES = [
  { value: 'warm', label: 'Warm' },
  { value: 'professional', label: 'Professional' },
  { value: 'concise', label: 'Concise' },
];

const TEMPLATES: Record<string, { email: string; sms: string }> = {
  '5-star-comments': {
    email: 'Thank the guest for their kind words. Mention specific positive feedback they provided. Reiterate your commitment to excellence. Close with a warm invitation to return.',
    sms: 'Express gratitude for the positive review. Briefly reference their highlighted points. Invite them back.'
  },
  '5-star-no-text': {
    email: 'Thank the guest for the perfect rating. Express that you are glad they enjoyed their stay. Extend an invitation to return.',
    sms: 'Thank you for the 5-star rating! We hope to welcome you back soon.'
  },
  'staff-praise': {
    email: 'Thank the guest for specifically mentioning the team. Share that the staff will be delighted to hear this. Emphasize that personal service is a priority.',
    sms: 'Thank you for recognizing our team! We will share your kind words with them. See you again!'
  },
  'cleanliness-praise': {
    email: 'Acknowledge the guest\\'s appreciation for cleanliness. Explain that hygiene is a top priority. Reassure them that standards remain high.',
    sms: 'Thank you for highlighting our cleanliness. We take great pride in it. Hope to host you again!'
  },
  'location-amenities': {
    email: 'Thank the guest for appreciating the location and amenities. Mention any specific amenities they enjoyed. Invite them to explore more next time.',
    sms: 'So glad you enjoyed our location and amenities! We look forward to your next visit.'
  },
  '3-star-mixed': {
    email: 'Acknowledge both positive and negative points mentioned. Apologize for any shortcomings. Thank them for their balanced feedback and offer to discuss further offline.',
    sms: 'Thank you for your honest review. We apologize for any issues. Please reach out to us directly so we can make things right.'
  },
  'cleanliness-complaint': {
    email: 'Sincerely apologize for the cleanliness concern. Explain that this does not meet our usual standards. Assure the guest that the team has been alerted. Offer offline follow-up.',
    sms: 'We are very sorry for the cleanliness issue. This is not our standard. Please contact us directly so we can address it.'
  },
  'noise-complaint': {
    email: 'Apologize for the noise disruption. Explain that guest comfort is paramount. Mention that the team will review the situation. Suggest offline contact for further resolution.',
    sms: 'We apologize for the noise disturbance. We take such matters seriously. Please reach out to us so we can learn more.'
  },
  'service-complaint': {
    email: 'Apologize sincerely for the service shortfall. Acknowledge the guest\\'s frustration. Confirm that the matter has been escalated. Offer offline follow-up.',
    sms: 'We truly apologize for the poor service. This is not the experience we aim to provide. Please contact us so we can make it right.'
  },
  'inaccurate-unfair': {
    email: 'Acknowledge the feedback respectfully. Clarify any inaccuracies without being defensive. Reaffirm your commitment to improvement. Leave the door open for further dialogue.',
    sms: 'Thank you for sharing your perspective. We value all feedback and are always improving. If you would like to discuss further, please reach out.'
  },
};

export default function ReviewReply() {
  const { activeLocationId, locations } = useReviewSail();
  const activeLoc = locations.find(l => l.id === activeLocationId);

  const [reviewText, setReviewText] = useState('');
  const [topic, setTopic] = useState(REVIEW_TOPICS[0].value);
  const [tone, setTone] = useState('warm');
  const [draft, setDraft] = useState('');
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const draftRef = useRef<HTMLTextAreaElement>(null);

  const template = TEMPLATES[topic] || TEMPLATES['5-star-comments'];

  const handleGenerate = useCallback(async () => {
    if (!reviewText.trim()) {
      setError('Please paste the review text first.');
      return;
    }
    setGenerating(true);
    setError('');
    setDraft('');

    try {
      const hotelName = activeLoc?.name || 'Our Hotel';
      const templateGuidance = `Email template: ${template.email}\nSMS template: ${template.sms}`;
      const { data, error: invokeError } = await supabase.functions.invoke('generate-review-reply', {
        body: {
          reviewText: reviewText.trim(),
          topic: REVIEW_TOPICS.find(t => t.value === topic)?.label || topic,
          tone,
          hotelName,
          templateGuidance,
        },
      });

      if (invokeError) throw invokeError;
      if (data.error) throw new Error(data.error);

      setDraft(data.draft || '');
    } catch (err: any) {
      setError(err.message || 'Failed to generate draft. Please try again.');
    } finally {
      setGenerating(false);
    }
  }, [reviewText, topic, tone, activeLoc?.name, template]);

  const handleCopy = useCallback(async () => {
    if (!draft) return;
    try {
      await navigator.clipboard.writeText(draft);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for older browsers
      if (draftRef.current) {
        draftRef.current.select();
        document.execCommand('copy');
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      }
    }
  }, [draft]);

  const handleReset = useCallback(() => {
    setReviewText('');
    setTopic(REVIEW_TOPICS[0].value);
    setTone('warm');
    setDraft('');
    setError('');
    setCopied(false);
  }, []);

  return (
    <div className="space-y-8">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Review Replies</h1>
        <p className="text-sm text-slate-500 mt-1">
          Paste a Google review, select a topic and tone, then generate an AI draft reply.
        </p>
      </div>

      {/* Input Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-5">
        <div className="flex items-center space-x-3">
          <div className="p-2.5 bg-indigo-50 rounded-xl">
            <FileText className="h-5 w-5 text-indigo-600" />
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900">Review Details</h2>
            <p className="text-xs text-slate-500">Paste the full review text you want to reply to.</p>
          </div>
        </div>

        {/* Hotel name display */}
        {activeLoc?.name && (
          <div className="bg-slate-50 rounded-lg px-3 py-2 text-xs text-slate-600">
            Replying as <span className="font-semibold text-slate-800">{activeLoc.name}</span>
          </div>
        )}

        {/* Review text */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Review Text</label>
          <textarea
            rows={4}
            value={reviewText}
            onChange={(e) => setReviewText(e.target.value)}
            placeholder="Paste the Google review here..."
            className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y"
          />
        </div>

        {/* Topic dropdown */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Review Topic</label>
          <select
            value={topic}
            onChange={(e) => setTopic(e.target.value)}
            className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white"
          >
            {REVIEW_TOPICS.map((t) => (
              <option key={t.value} value={t.value}>{t.label}</option>
            ))}
          </select>
        </div>

        {/* Tone dropdown */}
        <div>
          <label className="block text-xs font-bold text-slate-700 mb-1">Tone</label>
          <div className="flex space-x-2">
            {TONES.map((t) => (
              <button
                key={t.value}
                onClick={() => setTone(t.value)}
                className={`px-4 py-2 rounded-xl text-sm font-semibold border transition-colors ${
                  tone === t.value
                    ? 'bg-indigo-600 text-white border-indigo-600'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                }`}
              >
                {t.label}
              </button>
            ))}
          </div>
        </div>

        {/* Template guidance */}
        <div className="bg-slate-50 rounded-xl p-4 border border-slate-100">
          <div className="flex items-start space-x-2.5">
            <FileText className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
            <div>
              <p className="text-xs font-semibold text-slate-700">Topic Template Guidance</p>
              <p className="text-xs text-slate-500 mt-1 leading-relaxed">{template.email}</p>
            </div>
          </div>
        </div>

        {error && (
          <div className="bg-red-50 text-red-800 p-3.5 rounded-xl text-xs border border-red-200 flex items-start space-x-2">
            <AlertCircle className="h-4 w-4 shrink-0 mt-0.5" />
            <span>{error}</span>
          </div>
        )}

        <button
          onClick={handleGenerate}
          disabled={generating || !reviewText.trim()}
          className="w-full bg-indigo-600 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-700 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
        >
          {generating ? (
            <RefreshCw className="h-4 w-4 animate-spin" />
          ) : (
            <Sparkles className="h-4 w-4" />
          )}
          <span>{generating ? 'Generating Draft...' : 'AI Generate Draft'}</span>
        </button>
      </div>

      {/* Draft Card */}
      {draft && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-bold text-slate-900 flex items-center space-x-2">
              <Sparkles className="h-5 w-5 text-indigo-600" />
              <span>Generated Draft</span>
            </h2>
            <div className="flex items-center space-x-2">
              <button
                onClick={handleGenerate}
                disabled={generating}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                title="Regenerate"
              >
                <RotateCcw className="h-4 w-4" />
              </button>
              <button
                onClick={handleCopy}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors relative"
                title="Copy reply"
              >
                {copied ? (
                  <CheckCircle className="h-4 w-4 text-emerald-500" />
                ) : (
                  <Copy className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={handleReset}
                className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 hover:text-slate-700 transition-colors"
                title="Reset"
              >
                <RefreshCw className="h-4 w-4" />
              </button>
            </div>
          </div>

          <textarea
            ref={draftRef}
            rows={6}
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            className="w-full rounded-xl border-slate-200 shadow-sm focus:border-indigo-500 focus:ring-indigo-500 text-sm py-2.5 px-3 border bg-white resize-y"
          />

          <div className="flex items-center justify-between">
            {copied && (
              <span className="text-xs text-emerald-600 flex items-center space-x-1">
                <CheckCircle className="h-3.5 w-3.5" />
                <span>Copied!</span>
              </span>
            )}
            <span className="text-xs text-slate-400 flex items-center space-x-1">
              <AlertCircle className="h-3.5 w-3.5" />
              <span>AI drafts should always be reviewed before posting publicly.</span>
            </span>
          </div>

          {/* Action buttons */}
          <div className="flex space-x-3">
            <button
              onClick={handleCopy}
              className="flex-1 bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-colors flex items-center justify-center space-x-2 text-sm"
            >
              <Copy className="h-4 w-4" />
              <span>{copied ? 'Copied!' : 'Copy Reply'}</span>
            </button>
            <button
              onClick={handleGenerate}
              disabled={generating}
              className="flex-1 bg-indigo-50 text-indigo-700 font-semibold py-2.5 px-4 rounded-xl hover:bg-indigo-100 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2 text-sm"
            >
              <RotateCcw className="h-4 w-4" />
              <span>Regenerate</span>
            </button>
            <button
              onClick={handleReset}
              className="flex-1 bg-white text-slate-700 font-semibold py-2.5 px-4 rounded-xl border border-slate-200 hover:bg-slate-50 transition-colors flex items-center justify-center space-x-2 text-sm"
            >
              <RefreshCw className="h-4 w-4" />
              <span>Reset</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
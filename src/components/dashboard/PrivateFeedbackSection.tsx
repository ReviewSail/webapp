import { useState } from 'react';
import { Star, MessageSquare, Reply, CornerDownRight, CheckCircle, Download } from 'lucide-react';
import { format } from 'date-fns';

interface PrivateFeedbackSectionProps {
  feedbacks: any[];
  reviewRequests: any[];
  orders: any[];
  customers: any[];
  onRespond: (id: string, response: string) => Promise<void>;
}

export function PrivateFeedbackSection({
  feedbacks,
  reviewRequests,
  orders,
  customers,
  onRespond
}: PrivateFeedbackSectionProps) {
  const [activeReplyId, setActiveReplyId] = useState<string | null>(null);
  const [responseText, setResponseText] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [successId, setSuccessId] = useState<string | null>(null);

  const handleSendResponse = async (id: string) => {
    if (!responseText.trim()) return;
    setSubmitting(true);
    try {
      await onRespond(id, responseText.trim());
      setSuccessId(id);
      setResponseText('');
      setActiveReplyId(null);
      setTimeout(() => setSuccessId(null), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  const handleExportFeedbackCSV = () => {
    if (feedbacks.length === 0) return;

    const headers = ['Guest Name', 'Star Rating', 'Private Comment', 'Submission Date', 'Manager Response'];

    const rows = feedbacks.map((fb: any) => {
      const request = reviewRequests.find((r: any) => r.id === fb.requestId);
      const order = request ? orders.find((o: any) => o.id === request.orderId) : null;
      const customer = order ? customers.find((c: any) => c.id === order.customerId) : null;
      const guestName = customer ? `${customer.firstName} ${customer.lastName}` : 'Confidential Guest';

      return [
        guestName,
        fb.rating.toString(),
        fb.comment || fb.feedbackText || '',
        fb.createdAt ? format(new Date(fb.createdAt), 'yyyy-MM-dd HH:mm') : '',
        fb.managerResponse || ''
      ];
    });

    const csvContent = [
      headers.join(','),
      ...rows.map(r => r.map(val => `"${val.replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `private_feedback_export.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200/80 shadow-sm overflow-hidden mt-8">
      <div className="px-6 py-5 border-b border-slate-100 bg-slate-50/50 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <MessageSquare className="h-5 w-5 mr-2 text-indigo-600" />
            <span>Private Feedback & Service Recovery</span>
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Read and respond directly to confidential 1-5 star ratings sent via guest invites.
          </p>
        </div>

        {feedbacks.length > 0 && (
          <button
            onClick={handleExportFeedbackCSV}
            className="inline-flex items-center space-x-1.5 bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 font-semibold text-xs py-2 px-3.5 rounded-xl shadow-sm transition-all shrink-0"
          >
            <Download className="h-3.5 w-3.5" />
            <span>Export Feedback CSV</span>
          </button>
        )}
      </div>

      {feedbacks.length === 0 ? (
        <div className="p-12 text-center text-slate-400">
          <MessageSquare className="h-8 w-8 mx-auto mb-3 text-slate-300" />
          <p className="text-sm font-semibold text-slate-700">No private feedback yet</p>
          <p className="text-xs text-slate-400 mt-1">Confidential submissions will populate here automatically.</p>
        </div>
      ) : (
        <div className="divide-y divide-slate-100">
          {feedbacks.map((fb: any) => {
            const request = reviewRequests.find((r: any) => r.id === fb.requestId);
            const order = request ? orders.find((o: any) => o.id === request.orderId) : null;
            const customer = order ? customers.find((c: any) => c.id === order.customerId) : null;

            return (
              <div key={fb.id} className="p-6 hover:bg-slate-50/30 transition-colors space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center space-x-3">
                    <div className="h-9 w-9 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center">
                      {fb.guestName ? fb.guestName.split(' ').map((n: string) => n[0]).join('').slice(0, 2).toUpperCase() : customer ? `${customer.firstName[0]}${customer.lastName[0]}` : '??'}
                    </div>
                    <div>
                      <h4 className="text-sm font-semibold text-slate-800">
                        {fb.guestName || (customer ? `${customer.firstName} ${customer.lastName}` : 'Confidential Guest')}
                      </h4>
                      <p className="text-xs text-slate-400">
                        {fb.guestEmail || customer?.email || 'No email registered'}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-1">
                    {!fb.rating || fb.rating === 0 ? (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold bg-indigo-100 text-indigo-700 border border-indigo-200">
                        Recovery Message
                      </span>
                    ) : (
                      [1, 2, 3, 4, 5].map((star) => (
                        <Star
                          key={star}
                          className={`h-4.5 w-4.5 ${
                            star <= fb.rating ? 'fill-amber-400 text-amber-400' : 'text-slate-200'
                          }`}
                        />
                      ))
                    )}
                  </div>
                </div>

                <div className="bg-slate-50 p-4 rounded-xl text-xs text-slate-700 leading-relaxed border border-slate-100">
                  <p className="italic">"{fb.comment || fb.feedbackText || 'No written message.'}"</p>
                </div>

                {fb.managerResponse ? (
                  <div className="pl-6 flex items-start space-x-2.5">
                    <CornerDownRight className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                    <div className="bg-indigo-50/50 p-3.5 rounded-xl border border-indigo-100/40 flex-1 text-xs text-slate-700">
                      <span className="font-bold text-indigo-900 block mb-1">Your Response:</span>
                      <p className="italic text-slate-600">"{fb.managerResponse}"</p>
                    </div>
                  </div>
                ) : (
                  <div className="flex items-center justify-end">
                    {activeReplyId === fb.id ? (
                      <div className="w-full space-y-2 mt-2">
                        <textarea
                          rows={2}
                          value={responseText}
                          onChange={(e) => setResponseText(e.target.value)}
                          placeholder="Draft your private response..."
                          className="w-full text-xs rounded-xl border-slate-300 shadow-sm focus:border-indigo-500 py-2 px-3 border bg-white"
                        />
                        <div className="flex items-center justify-end space-x-2">
                          <button
                            onClick={() => {
                              setActiveReplyId(null);
                              setResponseText('');
                            }}
                            className="bg-slate-100 hover:bg-slate-200 text-slate-700 font-semibold text-[10px] py-1.5 px-3 rounded-lg"
                          >
                            Cancel
                          </button>
                          <button
                            onClick={() => handleSendResponse(fb.id)}
                            disabled={submitting || !responseText.trim()}
                            className="bg-indigo-600 hover:bg-indigo-700 text-white font-bold text-[10px] py-1.5 px-3 rounded-lg flex items-center space-x-1"
                          >
                            <Reply className="h-3 w-3" />
                            <span>{submitting ? 'Sending...' : 'Send Reply'}</span>
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="flex items-center space-x-2">
                        {successId === fb.id && (
                          <span className="text-[10px] font-semibold text-emerald-600 flex items-center">
                            <CheckCircle className="h-3.5 w-3.5 mr-1" />
                            Response saved!
                          </span>
                        )}
                        <button
                          onClick={() => {
                            setActiveReplyId(fb.id);
                            setResponseText('');
                          }}
                          className="text-xs bg-slate-900 hover:bg-slate-800 text-white font-semibold py-1.5 px-3 rounded-lg flex items-center space-x-1 shadow-sm transition-colors"
                        >
                          <Reply className="h-3.5 w-3.5" />
                          <span>Respond to Guest</span>
                        </button>
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
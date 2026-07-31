import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { X, Mail, Phone, Calendar, Clock, RefreshCw, Send, MousePointerClick, BedDouble } from 'lucide-react';
import { ReviewRequest, Order, Customer, MessageEvent } from '../../context/ReviewSailContext';
import { StatusBadge } from '../ui/StatusBadge';

interface GuestDetailPanelProps {
  request: ReviewRequest | null;
  order: Order | null;
  customer: Customer | null;
  events: MessageEvent[];
  onClose: () => void;
  onResend: (requestId: string) => Promise<boolean>;
}

export function GuestDetailPanel({ request, order, customer, events, onClose, onResend }: GuestDetailPanelProps) {
  const [sending, setSending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState(false);

  // The drawer had no keyboard exit at all — once open, the close button was
  // the only way out.
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!request || !order || !customer) return null;

  const handleResend = async () => {
    setSending(true);
    const ok = await onResend(request.id);
    if (ok) {
      setResendSuccess(true);
      setTimeout(() => setResendSuccess(false), 3000);
    }
    setSending(false);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Guest details"
      className="fixed inset-y-0 right-0 w-full max-w-sm bg-white border-l border-slate-200 shadow-xl z-50 overflow-y-auto animate-slide-in"
    >
      <div className="p-6">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-lg font-bold text-slate-900">Guest Details</h3>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors"
            aria-label="Close guest details"
          >
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <StatusBadge status={request.status} variant="detailed" className="mb-6" />

        {/* Guest Info */}
        <div className="space-y-4 bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Guest Information</h4>
          
          <div className="flex items-center space-x-3">
            <div className="h-10 w-10 rounded-full bg-indigo-100 text-indigo-700 font-bold text-sm flex items-center justify-center">
              {customer.firstName?.[0]}{customer.lastName?.[0]}
            </div>
            <div>
              <p className="text-sm font-semibold text-slate-800">{customer.firstName} {customer.lastName}</p>
            </div>
          </div>

          {customer.email && (
            <div className="flex items-center space-x-2.5 text-sm text-slate-600">
              <Mail className="h-4 w-4 text-slate-400" />
              <span>{customer.email}</span>
            </div>
          )}
          
          {customer.phone && (
            <div className="flex items-center space-x-2.5 text-sm text-slate-600">
              <Phone className="h-4 w-4 text-slate-400" />
              <span>{customer.phone}</span>
            </div>
          )}
        </div>

        {/* Order & Request Info */}
        <div className="space-y-4 bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
          <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Request Timeline</h4>

          <div className="flex items-center space-x-2.5 text-sm text-slate-600">
            <Calendar className="h-4 w-4 text-slate-400" />
            <span>Checkout: {format(new Date(order.checkoutDate), 'MMM d, yyyy')}</span>
          </div>

          {request.sentAt ? (
            <div className="flex items-center space-x-2.5 text-sm text-slate-600">
              <Send className="h-4 w-4 text-slate-400" />
              <span>Invite sent: {format(new Date(request.sentAt), 'MMM d, yyyy h:mm a')}</span>
            </div>
          ) : (
            <div className="flex items-center space-x-2.5 text-sm text-slate-600">
              <Clock className="h-4 w-4 text-slate-400" />
              <span>Not yet sent</span>
            </div>
          )}

          <div className="flex items-center space-x-2.5 text-sm text-slate-600">
            <Clock className="h-4 w-4 text-slate-400" />
            <span>Created: {format(new Date(order.checkoutDate), 'MMM d, yyyy')}</span>
          </div>
        </div>

        {/* Events Log */}
        {events.length > 0 && (
          <div className="space-y-3 bg-slate-50 rounded-xl p-4 border border-slate-100 mb-6">
            <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Message Events</h4>
            {events.map((evt) => {
              const isMidstay = evt.eventType === 'midstay_checkin';
              return (
                <div key={evt.id} className="flex items-center space-x-2.5 text-sm text-slate-600">
                  {isMidstay ? (
                    <BedDouble className="h-4 w-4 text-blue-500" />
                  ) : (
                    <MousePointerClick className="h-4 w-4 text-slate-400" />
                  )}
                  <span className={isMidstay ? 'text-blue-700 font-medium' : 'capitalize'}>
                    {isMidstay ? 'Mid-stay check-in sent' : evt.eventType.replace(/_/g, ' ')}
                  </span>
                  <span className="text-slate-400 text-xs">{format(new Date(evt.createdAt), 'MMM d, h:mm a')}</span>
                </div>
              );
            })}
          </div>
        )}

        {/* Resend (only for requests that have been sent already) */}
        {request.status === 'sent' && (
          <button
            onClick={handleResend}
            disabled={sending || resendSuccess}
            className="w-full bg-slate-900 text-white font-semibold py-2.5 px-4 rounded-xl hover:bg-slate-800 transition-colors disabled:opacity-50 flex items-center justify-center space-x-2"
          >
            {sending ? (
              <RefreshCw className="h-4 w-4 animate-spin" />
            ) : resendSuccess ? (
              <span className="text-emerald-400">✓ Sent!</span>
            ) : (
              <>
                <RefreshCw className="h-4 w-4" />
                <span>Resend Invite</span>
              </>
            )}
          </button>
        )}
      </div>
    </div>
  );
}
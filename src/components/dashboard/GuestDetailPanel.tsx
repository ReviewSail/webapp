import { format } from 'date-fns';
import { X, Mail, Phone, Calendar, Clock, ArrowRight, User, AlertCircle, RefreshCw, Send, CheckCircle, MousePointerClick } from 'lucide-react';
import { ReviewRequest, Order, Customer, MessageEvent } from '../../context/MapRatedContext';

interface GuestDetailPanelProps {
  isOpen: boolean;
  onClose: () => void;
  request: ReviewRequest | null;
  order: Order | null;
  customer: Customer | null;
  events: MessageEvent[];
}

export function GuestDetailPanel({
  isOpen,
  onClose,
  request,
  order,
  customer,
  events
}: GuestDetailPanelProps) {
  if (!isOpen || !request) return null;

  // Sort events chronologically
  const sortedEvents = [...events].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());

  const getEventIcon = (type: string) => {
    switch (type) {
      case 'sent':
        return <Send className="h-3.5 w-3.5 text-blue-600" />;
      case 'reminder_sent':
        return <RefreshCw className="h-3.5 w-3.5 text-amber-600" />;
      case 'clicked':
        return <MousePointerClick className="h-3.5 w-3.5 text-emerald-600" />;
      case 'failed':
        return <AlertCircle className="h-3.5 w-3.5 text-red-600" />;
      default:
        return <Clock className="h-3.5 w-3.5 text-slate-600" />;
    }
  };

  const getEventBadge = (type: string) => {
    switch (type) {
      case 'sent':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'reminder_sent':
        return 'bg-amber-50 text-amber-700 border-amber-100';
      case 'clicked':
        return 'bg-emerald-50 text-emerald-700 border-emerald-100';
      case 'failed':
        return 'bg-red-50 text-red-700 border-red-100';
      default:
        return 'bg-slate-50 text-slate-700 border-slate-100';
    }
  };

  const getStatusBadgeClass = (status: string) => {
    switch (status) {
      case 'sent':
        return 'bg-blue-50 text-blue-700 border-blue-100';
      case 'clicked':
      case 'already_reviewed':
        return 'bg-green-50 text-green-700 border-green-100';
      case 'expired':
        return 'bg-slate-100 text-slate-600 border-slate-200';
      case 'opted_out':
        return 'bg-red-50 text-red-700 border-red-100';
      default:
        return 'bg-amber-50 text-amber-700 border-amber-100';
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden" aria-labelledby="slide-over-title" role="dialog" aria-modal="true">
      {/* Backdrop */}
      <div 
        className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm transition-opacity" 
        onClick={onClose}
      />

      <div className="absolute inset-y-0 right-0 pl-10 max-w-full flex">
        <div className="w-screen max-w-md bg-white shadow-2xl border-l border-slate-200 flex flex-col h-full transform transition-transform duration-300">
          
          {/* Header */}
          <div className="px-6 py-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/50">
            <h3 className="text-md font-extrabold text-slate-900 flex items-center space-x-2">
              <User className="h-4.5 w-4.5 text-indigo-600" />
              <span>Guest File & Log Timeline</span>
            </h3>
            <button
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 p-1.5 hover:bg-slate-100 rounded-lg transition-all"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Body */}
          <div className="flex-1 overflow-y-auto p-6 space-y-6">
            
            {/* Guest Summary Card */}
            <div className="bg-gradient-to-br from-indigo-50/50 to-indigo-100/20 p-5 rounded-2xl border border-indigo-100/40 space-y-4">
              <div className="flex items-center space-x-3.5">
                <div className="h-12 w-12 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 text-md font-bold">
                  {customer ? `${customer.firstName[0]}${customer.lastName[0]}` : '??'}
                </div>
                <div>
                  <h4 className="font-extrabold text-slate-800 text-sm">
                    {customer ? `${customer.firstName} ${customer.lastName}` : 'Unidentified Guest'}
                  </h4>
                  <span className={`inline-flex items-center px-2 py-0.5 mt-1 rounded-full text-[10px] font-bold border ${getStatusBadgeClass(request.status)}`}>
                    {request.status.replace('_', ' ')}
                  </span>
                </div>
              </div>

              <div className="border-t border-indigo-100/40 pt-3 space-y-2.5 text-xs">
                <div className="flex items-center text-slate-600">
                  <Mail className="h-4 w-4 mr-2.5 text-slate-400 shrink-0" />
                  <span>{customer?.email || <span className="italic text-slate-400">No email registered</span>}</span>
                </div>
                <div className="flex items-center text-slate-600">
                  <Phone className="h-4 w-4 mr-2.5 text-slate-400 shrink-0" />
                  <span>{customer?.phone || <span className="italic text-slate-400">No phone registered</span>}</span>
                </div>
                <div className="flex items-center text-slate-600">
                  <Calendar className="h-4 w-4 mr-2.5 text-slate-400 shrink-0" />
                  <span>Checkout: <strong className="text-slate-700">{order ? format(new Date(order.checkoutDate), 'MMM d, yyyy') : '-'}</strong></span>
                </div>
              </div>
            </div>

            {/* Message Delivery Timeline */}
            <div className="space-y-4">
              <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center space-x-1.5">
                <Clock className="h-4 w-4" />
                <span>Message Dispatch Log</span>
              </h4>

              {sortedEvents.length === 0 ? (
                <div className="p-8 text-center bg-slate-50 border border-slate-100 rounded-xl">
                  <Clock className="h-6 w-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-500">No activity events logged yet.</p>
                  <p className="text-[10px] text-slate-400 mt-1">Events will update as the system contacts guests.</p>
                </div>
              ) : (
                <div className="relative pl-6 border-l-2 border-slate-100 space-y-6">
                  {sortedEvents.map((evt) => (
                    <div key={evt.id} className="relative">
                      {/* Timeline Dot */}
                      <span className="absolute -left-[31px] top-0.5 h-4 w-4 rounded-full bg-white border-2 border-indigo-500 flex items-center justify-center">
                        <span className="h-1.5 w-1.5 rounded-full bg-indigo-500" />
                      </span>

                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className={`inline-flex items-center px-2 py-0.5 rounded text-[10px] font-bold border capitalize ${getEventBadge(evt.eventType)}`}>
                            <span className="mr-1">{getEventIcon(evt.eventType)}</span>
                            {evt.eventType.replace('_', ' ')}
                          </span>
                          <span className="text-[10px] text-slate-400 font-medium">
                            {format(new Date(evt.createdAt), 'MMM d, h:mm a')}
                          </span>
                        </div>
                        <p className="text-xs text-slate-500 font-medium">
                          {evt.eventType === 'sent' && 'Initial automated review invitation dispatched successfully.'}
                          {evt.eventType === 'reminder_sent' && 'Follow-up friendly response nudge delivered.'}
                          {evt.eventType === 'clicked' && 'Guest successfully clicked onto your review links.'}
                          {evt.eventType === 'failed' && 'Message bounce or delivery failure detected.'}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

          </div>

          {/* Footer */}
          <div className="p-6 border-t border-slate-100 bg-slate-50/50 flex justify-end">
            <button
              onClick={onClose}
              className="bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs py-2.5 px-5 rounded-xl transition-all shadow-sm"
            >
              Close guest panel
            </button>
          </div>

        </div>
      </div>
    </div>
  );
}
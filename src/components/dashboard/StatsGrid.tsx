import { Send, CheckCircle, MousePointerClick, TrendingUp, Clock, AlertCircle, UserCheck } from 'lucide-react';

interface StatsGridProps {
  totalSent: number;
  totalPending: number;
  deliveryRate: number;
  clickRate: number;
  totalClicked: number;
  totalOptedOut: number;
}

export function StatsGrid({
  totalSent,
  totalPending,
  deliveryRate,
  clickRate,
  totalClicked,
  totalOptedOut
}: StatsGridProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
      {/* Card 1: Sent */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
        <div className="absolute right-4 top-4 p-3 bg-indigo-50 text-indigo-600 rounded-xl group-hover:scale-110 transition-transform">
          <Send className="h-5 w-5" />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Total Invites Sent</span>
        <div className="flex items-baseline space-x-2 mt-2">
          <span className="text-3xl font-bold text-slate-900 tracking-tight">{totalSent}</span>
          <span className="text-xs font-medium text-green-600 bg-green-50 px-2 py-0.5 rounded-full flex items-center">
            <TrendingUp className="h-3 w-3 mr-1" />
            Active
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-4 flex items-center">
          <Clock className="h-3.5 w-3.5 mr-1 text-slate-400" />
          {totalPending} requests currently in outbox queue
        </p>
      </div>

      {/* Card 2: Delivery Rate */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
        <div className="absolute right-4 top-4 p-3 bg-emerald-50 text-emerald-600 rounded-xl group-hover:scale-110 transition-transform">
          <CheckCircle className="h-5 w-5" />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Delivery Rate</span>
        <div className="flex items-baseline space-x-2 mt-2">
          <span className="text-3xl font-bold text-slate-900 tracking-tight">
            {deliveryRate}%
          </span>
          <span className="text-xs font-medium text-slate-500 bg-slate-100 px-2 py-0.5 rounded-full">
            Live
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-4 flex items-center">
          <AlertCircle className="h-3.5 w-3.5 mr-1 text-slate-400" />
          Strict automated unsubscribe screening active
        </p>
      </div>

      {/* Card 3: Click Rate */}
      <div className="bg-white p-6 rounded-2xl border border-slate-200/80 shadow-sm relative overflow-hidden group">
        <div className="absolute right-4 top-4 p-3 bg-violet-50 text-violet-600 rounded-xl group-hover:scale-110 transition-transform">
          <MousePointerClick className="h-5 w-5" />
        </div>
        <span className="text-xs font-semibold text-slate-400 uppercase tracking-wider">Review Link Click Rate</span>
        <div className="flex items-baseline space-x-2 mt-2">
          <span className="text-3xl font-bold text-slate-900 tracking-tight">{clickRate}%</span>
          <span className="text-xs font-medium text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded-full">
            {totalClicked} clicks
          </span>
        </div>
        <p className="text-xs text-slate-500 mt-4 flex items-center">
          <UserCheck className="h-3.5 w-3.5 mr-1 text-slate-400" />
          {totalOptedOut} customers opted out / unsubscribed
        </p>
      </div>
    </div>
  );
}
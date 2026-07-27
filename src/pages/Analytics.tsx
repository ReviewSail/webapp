// ... (the file content above is unchanged)

      {/* Recent Activity */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/50">
          <h2 className="text-lg font-bold text-slate-900 flex items-center">
            <BarChart3 className="h-5 w-5 mr-2 text-indigo-600" />
            Recent Activity
          </h2>
        </div>

        {recentActivity.length > 0 ? (
          <div className="divide-y divide-slate-50">
            {recentActivity.map((event) => (
              <div
                key={event.id}
                className="px-6 py-4 flex items-center space-x-4 hover:bg-slate-50/50 transition-colors"
              >
                <div className="h-9 w-9 rounded-full bg-indigo-50 text-indigo-700 font-bold text-xs flex items-center justify-center shrink-0">
                  {event.guestInitials}
                </div>
                <div className="flex-1 min-w-0">
                  <p className="text-sm font-semibold text-slate-800 truncate">
                    {event.guestName}
                  </p>
                  <p className="text-xs text-slate-500 mt-0.5 flex items-center">
                    {event.type === 'request_sent' ? (
                      <>
                        <Send className="h-3 w-3 mr-1 text-indigo-400" />
                        Review request sent
                      </>
                    ) : (
                      <>
                        <CheckCircle className="h-3 w-3 mr-1 text-emerald-400" />
                        Review completed
                      </>
                    )}
                  </p>
                </div>
                <span className="text-xs text-slate-400 shrink-0">
                  {timeAgo(event.timestamp)}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="px-6 py-8 text-center text-slate-400 text-sm">
            No recent activity for the selected period.
          </div>
        )}
      </div>
    </div>
  );
}
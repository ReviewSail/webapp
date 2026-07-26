` which is broken. The original Sidebar.tsx before the update was:

```
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileUp, Users, Settings, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useMapRated } from '../context/MapRatedContext';

export function Sidebar() {
  const { role } = useAuth();
  const { unreadPrivateFeedbackCount } = useMapRated();
  ...
```

But my previous dyad-write for Sidebar.tsx seems to have been malformed because it started with `<dyad-write path="src/components/Sidebar.tsx" description="Add Feedback nav item with unread badge">` and then had a continuation that duplicated the imports. The actual content got corrupted. I need to write the correct Sidebar.tsx now.

Also note: the error message from the user includes "Failed to deploy Supabase function: supabase/functions/process-reviews/index.ts" due to a template literal issue. That has a pending error: The process-reviews function had a line with a template literal inside a backtick that wasn't closed properly. In my previous write of process-reviews, I had a stray backtick after the remider section. The user then reported a deployment error. We need to fix both issues.

I'll address Sidebar.tsx and process-reviews/index.ts.

First, write correct Sidebar.tsx with proper imports and nav items including Feedback with badge.

Second, fix the process-reviews index.ts to remove the stray backtick and ensure the Twilio auth line is correct. The error: `'Authorization': \`Basic ${twilioAuth}\`, ~~~~~` suggests there's a syntax error in that line. Possibly the line is inside a template string that was not closed. In my previous write, I had a code block that started with a backtick incorrectly. I need to rewrite the file cleanly.

Let me rewrite both files.</think>Fix the Sidebar.tsx and process-reviews index.ts files.

<dyad-write path="src/components/Sidebar.tsx" description="Fix sidebar imports and add Feedback nav item with unread badge">
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileUp, Users, Settings, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useMapRated } from '../context/MapRatedContext';

export function Sidebar() {
  const { role } = useAuth();
  const { unreadPrivateFeedbackCount } = useMapRated();

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sync Guests', href: '/import', icon: FileUp },
    { name: 'Guests', href: '/guests', icon: Users },
    { name: 'Feedback', href: '/dashboard?tab=feedback', icon: MessageSquare, badge: unreadPrivateFeedbackCount },
    ...(role !== 'staff' ? [{ name: 'Settings', href: '/settings', icon: Settings }] : []),
  ];

  return (
    <div className="flex flex-col w-64 bg-slate-950 border-r border-slate-900 text-slate-300 shadow-xl shrink-0">
      <div className="flex h-16 shrink-0 items-center px-6 bg-slate-950 border-b border-slate-900">
        <span className="text-xl font-bold text-white tracking-tight flex items-center space-x-1.5">
          <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-sm font-black">M</span>
          <span>MapRated</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 py-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  isActive ? 'bg-indigo-500/10 text-white border-l-4 border-indigo-500 pl-3' : 'hover:bg-slate-900 hover:text-white pl-4',
                  'group flex items-center py-3 text-sm font-medium transition-all'
                )
              }
            >
              {({ isActive }) => (
                <>
                  <div className="relative flex items-center flex-1">
                    <item.icon className={cn(isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300', 'mr-3 h-5 w-5 flex-shrink-0')} aria-hidden="true" />
                    <span>{item.name}</span>
                    {item.badge !== undefined && item.badge > 0 && (
                      <span className="ml-auto mr-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white min-w-[20px] h-5">
                        {item.badge > 99 ? '99+' : item.badge}
                      </span>
                    )}
                  </div>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
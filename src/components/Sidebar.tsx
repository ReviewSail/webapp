import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileUp, Users, Settings, MessageSquare } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth<dyad-write path="src/components/Sidebar.tsx" description="Add Feedback nav item with unread badge">
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
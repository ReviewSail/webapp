import { NavLink, useLocation } from 'react-router-dom';
import { LayoutDashboard, FileUp, Users, Settings, MessageSquare, MessageCircle, BarChart3 } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useReviewSail } from '../context/ReviewSailContext';
import { isStaff } from '../lib/roles';

interface SidebarProps {
  /** Called after a nav item is picked, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { role } = useAuth();
  const { unreadPrivateFeedbackCount } = useReviewSail();
  const location = useLocation();

  // Dashboard and Feedback share the /dashboard path and differ only by
  // ?tab=, which NavLink's isActive ignores — so both lit up at once. These
  // two decide on the tab; everything else keeps NavLink's own matching.
  const currentTab = new URLSearchParams(location.search).get('tab');
  const onDashboard = location.pathname === '/dashboard';
  const tabAware = (href: string): boolean | undefined => {
    if (href === '/dashboard') return onDashboard && currentTab !== 'feedback';
    if (href === '/dashboard?tab=feedback') return onDashboard && currentTab === 'feedback';
    return undefined;
  };

  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
    { name: 'Sync Guests', href: '/import', icon: FileUp },
    { name: 'Guests', href: '/guests', icon: Users },
    { name: 'Feedback', href: '/dashboard?tab=feedback', icon: MessageSquare, badge: unreadPrivateFeedbackCount },
    { name: 'Review Replies', href: '/reply', icon: MessageCircle },
    ...(isStaff(role) ? [] : [{ name: 'Settings', href: '/settings', icon: Settings }]),
  ];

  return (
    <div className="flex flex-col h-full w-64 bg-slate-950 border-r border-slate-900 text-slate-300 shadow-xl">
      <div className="flex h-16 shrink-0 items-center px-6 bg-slate-950 border-b border-slate-900">
        <span className="text-xl font-bold text-white tracking-tight flex items-center space-x-1.5">
          <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-sm font-black">R</span>
          <span>ReviewSail</span>
        </span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 py-4">
          {navigation.map((item) => {
            const override = tabAware(item.href);
            return (
            <NavLink
              key={item.name}
              to={item.href}
              onClick={onNavigate}
              className={({ isActive: navActive }) => {
                const isActive = override ?? navActive;
                return cn(
                  isActive
                    ? 'bg-indigo-500/10 text-white border-l-4 border-indigo-500 pl-3'
                    : 'hover:bg-slate-900 hover:text-white pl-4',
                  'group flex items-center py-3 text-sm font-medium transition-all'
                );
              }}
            >
              {({ isActive: navActive }) => {
                const isActive = override ?? navActive;
                return (
                <div className="relative flex items-center flex-1">
                  <item.icon
                    className={cn(
                      isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300',
                      'mr-3 h-5 w-5 flex-shrink-0'
                    )}
                    aria-hidden="true"
                  />
                  <span>{item.name}</span>
                  {item.badge !== undefined && item.badge > 0 && (
                    <span className="ml-auto mr-2 inline-flex items-center justify-center px-2 py-0.5 rounded-full text-[10px] font-bold bg-indigo-600 text-white min-w-[20px] h-5">
                      {item.badge > 99 ? '99+' : item.badge}
                    </span>
                  )}
                </div>
                );
              }}
            </NavLink>
            );
          })}
        </nav>
      </div>
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileUp, Settings } from 'lucide-react';
import { cn } from '../lib/utils';

const navigation = [
  { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
  { name: 'Import Data', href: '/import', icon: FileUp },
  { name: 'Settings', href: '/settings', icon: Settings },
];

export function Sidebar() {
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
                  <item.icon className={cn(isActive ? 'text-indigo-400' : 'text-slate-500 group-hover:text-slate-300', 'mr-3 h-5 w-5 flex-shrink-0')} aria-hidden="true" />
                  <span>{item.name}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
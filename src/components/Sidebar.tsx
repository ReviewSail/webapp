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
    <div className="flex flex-col w-64 bg-slate-900 border-r border-slate-800 text-slate-300">
      <div className="flex h-16 shrink-0 items-center px-6 bg-slate-950">
        <span className="text-xl font-bold text-white tracking-tight">MapRated</span>
      </div>
      <div className="flex flex-1 flex-col overflow-y-auto">
        <nav className="flex-1 space-y-1 px-4 py-4">
          {navigation.map((item) => (
            <NavLink
              key={item.name}
              to={item.href}
              className={({ isActive }) =>
                cn(
                  isActive ? 'bg-slate-800 text-white' : 'hover:bg-slate-800 hover:text-white',
                  'group flex items-center px-2 py-2 text-sm font-medium rounded-md transition-colors'
                )
              }
            >
              <item.icon className="mr-3 h-5 w-5 flex-shrink-0" aria-hidden="true" />
              {item.name}
            </NavLink>
          ))}
        </nav>
      </div>
    </div>
  );
}
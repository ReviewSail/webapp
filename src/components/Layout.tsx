import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import { Sidebar } from './Sidebar';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, Menu } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { cn } from '../lib/utils';

export function Layout() {
  const { locations, activeLocationId, setActiveLocationId } = useReviewSail();
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

  // The Feedback nav item is /dashboard?tab=feedback, so the drawer has to react
  // to the query string too, not just the pathname.
  useEffect(() => {
    setNavOpen(false);
  }, [location.pathname, location.search]);

  useEffect(() => {
    if (!navOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setNavOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [navOpen]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
  };

  const initials = user?.email
    ? user.email.substring(0, 2).toUpperCase()
    : 'AD';

  return (
    <div className="flex h-screen overflow-hidden bg-slate-50 text-slate-900">
      {/* Desktop sidebar */}
      <div className="hidden md:flex shrink-0">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {navOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/60 backdrop-blur-sm md:hidden animate-fade-in"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 md:hidden transform transition-transform duration-200 ease-out',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-slate-200 bg-white px-4 md:px-8 shadow-sm">
          <div className="flex items-center space-x-3 md:hidden">
            <button
              onClick={() => setNavOpen(true)}
              className="p-1.5 -ml-1.5 rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 transition-colors"
              aria-label="Open navigation"
              aria-expanded={navOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            <span className="text-lg font-bold text-slate-900 tracking-tight flex items-center space-x-1.5">
              <span className="bg-indigo-600 text-white px-1.5 py-0.5 rounded text-xs font-black">R</span>
              <span>ReviewSail</span>
            </span>
          </div>

          <div className="flex items-center space-x-3 md:space-x-6 ml-auto">
            <div className="flex items-center text-sm text-slate-500 bg-slate-100 px-3 py-1.5 rounded-md max-w-[10rem] md:max-w-none">
              <MapPin className="mr-2 h-4 w-4 text-slate-400 shrink-0" />
              <select
                className="bg-transparent border-none text-slate-700 font-medium focus:ring-0 cursor-pointer p-0 pr-4 truncate"
                value={activeLocationId || ''}
                onChange={(e) => setActiveLocationId(e.target.value)}
                aria-label="Active location"
              >
                {locations.map((loc) => (
                  <option key={loc.id} value={loc.id}>
                    {loc.name}
                  </option>
                ))}
              </select>
            </div>
            <button
              onClick={() => navigate('/settings?tab=account')}
              className="h-8 w-8 shrink-0 rounded-full bg-indigo-100 border border-indigo-200 flex items-center justify-center text-indigo-700 font-medium text-sm hover:bg-indigo-200 hover:border-indigo-300 transition-all cursor-pointer"
              title="Account settings"
            >
              {initials}
            </button>
            <button
              onClick={handleLogout}
              className="text-slate-400 hover:text-slate-600 transition-colors"
              title="Sign out"
            >
              <LogOut className="h-5 w-5" />
            </button>
          </div>
        </header>
        <main className="flex-1 overflow-y-auto bg-slate-50 p-4 md:p-8">
          <div className="mx-auto max-w-5xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

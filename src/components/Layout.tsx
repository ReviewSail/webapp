import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import { Sidebar } from './Sidebar';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, Menu, Check, ChevronsUpDown, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { isAdmin } from '../lib/roles';
import { cn } from '../lib/utils';

export function Layout() {
  const { locations, activeLocationId, setActiveLocationId } = useReviewSail();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);

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

  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'AD';
  const activeLocation = locations.find((l) => l.id === activeLocationId);

  return (
    <div className="flex h-screen overflow-hidden bg-canvas text-ink">
      {/* Desktop sidebar */}
      <div className="hidden shrink-0 md:flex">
        <Sidebar />
      </div>

      {/* Mobile drawer */}
      {navOpen && (
        <div
          className="animate-fade-in fixed inset-0 z-40 bg-brand-950/60 backdrop-blur-sm md:hidden"
          onClick={() => setNavOpen(false)}
          aria-hidden="true"
        />
      )}
      <div
        className={cn(
          'fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 ease-out md:hidden',
          navOpen ? 'translate-x-0' : '-translate-x-full'
        )}
      >
        <Sidebar onNavigate={() => setNavOpen(false)} />
      </div>

      <div className="flex flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between border-b border-line bg-card px-4 md:px-8">
          <div className="flex items-center gap-3 md:hidden">
            <button
              onClick={() => setNavOpen(true)}
              className="-ml-1.5 rounded-lg p-1.5 text-ink-muted transition-colors hover:bg-canvas hover:text-ink"
              aria-label="Open navigation"
              aria-expanded={navOpen}
            >
              <Menu className="h-5 w-5" />
            </button>
            {/* The wordmark drops below 400px: the drawer carries the brand,
                and on a narrow phone the location picker and sign-out matter
                more than repeating the product name. */}
            <span className="flex items-center gap-2 text-[15px] font-semibold tracking-[-0.02em] text-ink">
              <span className="flex h-5 w-5 items-center justify-center rounded bg-brand-600 text-[11px] font-bold text-white">
                R
              </span>
              <span className="hidden min-[400px]:inline">ReviewSail</span>
            </span>
          </div>

          <div className="ml-auto flex min-w-0 items-center gap-1 md:gap-2">
            {/* A real menu, not a bare <select> in a grey pill — the native
                dropdown couldn't be styled and gave no sign it was a control. */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex min-w-0 max-w-[9rem] items-center gap-2 rounded-lg border border-line px-2.5 py-1.5 text-sm text-ink transition-colors hover:bg-canvas data-[state=open]:bg-canvas sm:max-w-[14rem] md:max-w-none"
                  aria-label="Switch location"
                >
                  <MapPin className="h-4 w-4 shrink-0 text-ink-faint" />
                  <span className="truncate font-medium">
                    {activeLocation?.name ?? 'Select location'}
                  </span>
                  <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-faint" />
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="animate-fade-in z-50 min-w-[13rem] rounded-xl border border-line bg-card p-1 shadow-pop"
                >
                  {locations.length === 0 && (
                    <p className="px-2.5 py-2 text-sm text-ink-muted">No properties yet</p>
                  )}
                  {locations.map((loc) => (
                    <DropdownMenu.Item
                      key={loc.id}
                      onSelect={() => setActiveLocationId(loc.id)}
                      className="flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-canvas"
                    >
                      <Check
                        className={cn(
                          'h-4 w-4 shrink-0 text-brand-600',
                          loc.id === activeLocationId ? 'opacity-100' : 'opacity-0'
                        )}
                      />
                      <span className="truncate">{loc.name}</span>
                    </DropdownMenu.Item>
                  ))}
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>

            {/*
              One menu instead of a bare avatar plus a separate sign-out icon.

              The avatar used to navigate straight to /settings?tab=account —
              a route behind AdminRoute. A staff member clicking their own
              initials was bounced to /dashboard?access_denied=true and told
              "Access restricted". The door is now only shown to people it opens
              for.
            */}
            <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild>
                <button
                  className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-[11px] font-semibold text-brand-700 transition-colors hover:bg-brand-100 data-[state=open]:bg-brand-100"
                  aria-label="Account menu"
                >
                  {initials}
                </button>
              </DropdownMenu.Trigger>
              <DropdownMenu.Portal>
                <DropdownMenu.Content
                  align="end"
                  sideOffset={6}
                  className="animate-fade-in z-50 min-w-[14rem] rounded-xl border border-line bg-card p-1 shadow-pop"
                >
                  {user?.email && (
                    <div className="border-b border-line px-2.5 py-2">
                      <p className="truncate text-sm font-medium text-ink">{user.email}</p>
                      <p className="text-xs text-ink-muted">{isAdmin(role) ? 'Administrator' : 'Staff'}</p>
                    </div>
                  )}
                  {isAdmin(role) && (
                    <DropdownMenu.Item
                      onSelect={() => navigate('/settings?tab=account')}
                      className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-canvas"
                    >
                      <SettingsIcon className="h-4 w-4 shrink-0 text-ink-faint" />
                      <span>Account settings</span>
                    </DropdownMenu.Item>
                  )}
                  <DropdownMenu.Item
                    onSelect={handleLogout}
                    className="mt-1 flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-canvas"
                  >
                    <LogOut className="h-4 w-4 shrink-0 text-ink-faint" />
                    <span>Sign out</span>
                  </DropdownMenu.Item>
                </DropdownMenu.Content>
              </DropdownMenu.Portal>
            </DropdownMenu.Root>
          </div>
        </header>

        <main className="flex-1 overflow-y-auto p-4 md:p-8">
          <div className="mx-auto max-w-6xl">
            <Outlet />
          </div>
        </main>
      </div>
    </div>
  );
}

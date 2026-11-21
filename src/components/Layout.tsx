import { useEffect, useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import * as DropdownMenu from '@radix-ui/react-dropdown-menu';
import * as Dialog from '@radix-ui/react-dialog';
import { Sidebar } from './Sidebar';
import { useReviewSail } from '../context/ReviewSailContext';
import { useAuth } from '../context/AuthContext';
import { MapPin, LogOut, Menu, Check, ChevronsUpDown, X, Settings as SettingsIcon } from 'lucide-react';
import { supabase } from '../integrations/supabase/client';
import { isAdmin } from '../lib/roles';
import { cn } from '../lib/utils';

export function Layout() {
  const { locations, activeLocationId, setActiveLocationId } = useReviewSail();
  const { user, role } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [navOpen, setNavOpen] = useState(false);
  const [signingOut, setSigningOut] = useState(false);
  const [signOutError, setSignOutError] = useState('');
  const signOut = async () => {
    if (signingOut) return;
    setSigningOut(true);
    setSignOutError('');
    try {
      // EGRESS-COST: low — explicit sign-out; cache removal follows SIGNED_OUT.
      const { error } = await supabase.auth.signOut();
      if (error) throw error;
    } catch {
      setSignOutError('Could not sign out. Please try again; this browser may still be signed in.');
    } finally { setSigningOut(false); }
  };
  useEffect(() => { setNavOpen(false); }, [location.pathname, location.search]);
  const initials = user?.email ? user.email.substring(0, 2).toUpperCase() : 'AD';
  const activeLocation = locations.find(item => item.id === activeLocationId);
  const itemClass = 'flex cursor-pointer items-center gap-2 rounded-lg px-2.5 py-2.5 text-sm text-ink outline-none transition-colors data-[highlighted]:bg-canvas';
  return (
    <div className="flex h-[100dvh] overflow-hidden bg-canvas text-ink">
      <a href="#main-content" className="sr-only z-[60] rounded-lg bg-card p-3 text-ink focus:not-sr-only focus:absolute focus:left-4 focus:top-4">Skip to content</a>
      <aside className="hidden shrink-0 md:flex"><Sidebar /></aside>
      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-16 shrink-0 items-center justify-between gap-3 border-b border-line bg-card px-4 md:px-8">
          <div className="flex min-w-0 items-center gap-2">
            <Dialog.Root open={navOpen} onOpenChange={setNavOpen}>
              <Dialog.Trigger asChild><button className="-ml-2 rounded-lg p-2.5 text-ink-muted md:hidden" aria-label="Open navigation"><Menu className="h-5 w-5" /></button></Dialog.Trigger>
              <Dialog.Portal>
                <Dialog.Overlay className="fixed inset-0 z-40 bg-brand-950/60" />
                <Dialog.Content className="fixed inset-y-0 left-0 z-50 w-56" aria-describedby={undefined}>
                  <Dialog.Title className="sr-only">Navigation</Dialog.Title>
                  <Sidebar onNavigate={() => setNavOpen(false)} />
                  <Dialog.Close asChild><button aria-label="Close navigation" className="absolute right-[-48px] top-3 rounded-lg bg-card p-2.5 text-ink"><X className="h-5 w-5" /></button></Dialog.Close>
                </Dialog.Content>
              </Dialog.Portal>
            </Dialog.Root>
            {locations.length > 1 ? <DropdownMenu.Root>
              <DropdownMenu.Trigger asChild><button className="flex min-w-0 max-w-[65vw] items-center gap-2 rounded-lg px-2 py-2 text-sm transition-colors hover:bg-canvas sm:max-w-sm" aria-label="Switch location"><MapPin className="h-4 w-4 shrink-0 text-ink-muted" /><span className="truncate font-medium">{activeLocation?.name ?? 'Select property'}</span><ChevronsUpDown className="h-3.5 w-3.5 shrink-0 text-ink-muted" /></button></DropdownMenu.Trigger>
              <DropdownMenu.Portal><DropdownMenu.Content align="start" sideOffset={6} className="z-50 max-w-[90vw] rounded-xl border border-line bg-card p-1 shadow-pop">{locations.map(item => <DropdownMenu.Item key={item.id} onSelect={() => setActiveLocationId(item.id)} className={itemClass}><Check className={cn('h-4 w-4 shrink-0 text-brand-700', item.id === activeLocationId ? 'opacity-100' : 'opacity-0')} /><span className="truncate">{item.name}</span></DropdownMenu.Item>)}</DropdownMenu.Content></DropdownMenu.Portal>
            </DropdownMenu.Root> : <p className="truncate text-sm font-semibold">{activeLocation?.name ?? 'ReviewSail'}</p>}
          </div>
          <DropdownMenu.Root>
            <DropdownMenu.Trigger asChild><button className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-semibold text-brand-700 transition-colors hover:bg-brand-100" aria-label="Account menu">{initials}</button></DropdownMenu.Trigger>
            <DropdownMenu.Portal><DropdownMenu.Content align="end" sideOffset={6} className="z-50 min-w-[14rem] max-w-[90vw] rounded-xl border border-line bg-card p-1 shadow-pop">
              {user?.email && <div className="border-b border-line px-2.5 py-2"><p className="truncate text-sm font-medium text-ink">{user.email}</p><p className="text-xs text-ink-muted">{isAdmin(role) ? 'Administrator' : 'Staff'}</p></div>}
              {isAdmin(role) && <DropdownMenu.Item onSelect={() => navigate('/settings?tab=account')} className={itemClass}><SettingsIcon className="h-4 w-4 text-ink-muted" />Account settings</DropdownMenu.Item>}
              <DropdownMenu.Item disabled={signingOut} onSelect={() => { void signOut(); }} className={itemClass}><LogOut className="h-4 w-4 text-ink-muted" />{signingOut ? 'Signing out…' : 'Sign out'}</DropdownMenu.Item>
            </DropdownMenu.Content></DropdownMenu.Portal>
          </DropdownMenu.Root>
        </header>
        {signOutError && <p role="alert" className="px-4 py-2 text-sm text-critical">{signOutError}</p>}
        <main id="main-content" tabIndex={-1} className="flex-1 overflow-y-auto p-4 md:p-8"><div className="mx-auto max-w-6xl"><Outlet /></div></main>
      </div>
    </div>
  );
}

import { NavLink } from 'react-router-dom';
import { LayoutDashboard, FileUp, Users, Settings, MessageSquare, MessageCircle, BarChart3, type LucideIcon } from 'lucide-react';
import { cn } from '../lib/utils';
import { useAuth } from '../context/AuthContext';
import { useReviewSail } from '../context/ReviewSailContext';
import { isAdmin } from '../lib/roles';
import { SailMark } from './brand/SailMark';

/** Exact build provenance, so a deploy can be identified down to the second. */
function BuildStamp() {
  const stamp = (iso: string) =>
    new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      timeZoneName: 'short',
    });

  return (
    <div
      className="shrink-0 border-t border-white/10 px-5 py-3 font-mono text-[10px] leading-relaxed text-white/50"
      title={[
        `version   ${__APP_VERSION__}`,
        `branch    ${__BUILD_BRANCH__}`,
        `commit    ${__BUILD_SHA__}`,
        `committed ${__COMMIT_TIME__}`,
        `built     ${__BUILD_TIME__}`,
      ].join('\n')}
    >
      <div className="text-white/65">
        v{__APP_VERSION__} · {__BUILD_SHA__.slice(0, 7)}
      </div>
      <div>{stamp(__BUILD_TIME__)}</div>
    </div>
  );
}

type NavEntry = {
  name: string;
  href: string;
  icon: LucideIcon;
  badge?: number;
};

/** One nav row. Shared so the pinned Settings row cannot drift from the list. */
function NavItem({ item, onNavigate }: { item: NavEntry; onNavigate?: () => void }) {
  return (
    <NavLink
      to={item.href}
      onClick={onNavigate}
      className={({ isActive }) =>
        cn(
          'group flex items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors',
          isActive
            ? 'bg-white/10 font-medium text-white'
            : 'hover:bg-white/5 hover:text-white'
        )
      }
    >
      {({ isActive }) => (
        <>
          <item.icon
            className={cn(
              'h-[18px] w-[18px] shrink-0 transition-colors',
              isActive ? 'text-brand-300' : 'text-white/40 group-hover:text-white/70'
            )}
            aria-hidden="true"
          />
          <span className="truncate">{item.name}</span>
          {item.badge !== undefined && item.badge > 0 && (
            <span className="tnum ml-auto inline-flex h-5 min-w-[20px] items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-semibold text-white">
              {item.badge > 99 ? '99+' : item.badge}
            </span>
          )}
        </>
      )}
    </NavLink>
  );
}

interface SidebarProps {
  /** Called after a nav item is picked, so the mobile drawer can close itself. */
  onNavigate?: () => void;
}

export function Sidebar({ onNavigate }: SidebarProps) {
  const { role } = useAuth();
  const { unreadPrivateFeedbackCount } = useReviewSail();

  // Ordered by the guest lifecycle rather than by whatever got written first:
  // bring guests in, see who they are, read what they said privately, reply
  // publicly, then look at the trend. Analytics used to sit second, above every
  // screen an operator opens daily, despite being a weekly glance.
  //
  // Feedback has its own route now, so NavLink's own matching is enough. It
  // used to point at /dashboard?tab=feedback, which NavLink can't tell apart
  // from /dashboard — both items lit up at once and needed a manual override.
  const navigation = [
    { name: 'Dashboard', href: '/dashboard', icon: LayoutDashboard },
    { name: 'Sync Guests', href: '/import', icon: FileUp },
    { name: 'Guests', href: '/guests', icon: Users },
    { name: 'Feedback', href: '/inbox', icon: MessageSquare, badge: unreadPrivateFeedbackCount },
    { name: 'Review Replies', href: '/reply', icon: MessageCircle },
    { name: 'Analytics', href: '/analytics', icon: BarChart3 },
  ];

  return (
    // Flat navy, not a gradient: this surface is on every screen, so a gradient
    // here would spend the one-gradient budget permanently.
    <div className="flex h-full w-64 flex-col bg-brand-950 text-white/70">
      <div className="flex h-16 shrink-0 items-center px-5">
        {/* Icon-only mark. The wordmark stays live text rather than being baked
            into the artwork, so it stays crisp at any zoom and follows the
            theme. text-brand-950 sets the colour the sail gap is cut with. */}
        <span className="flex items-center gap-2.5 text-[17px] font-semibold tracking-[-0.02em] text-white">
          <SailMark className="h-7 w-7 shrink-0 text-brand-950" title="ReviewSail" />
          <span>ReviewSail</span>
        </span>
      </div>

      <nav className="flex-1 space-y-0.5 overflow-y-auto px-2 py-2">
        {navigation.map((item) => (
          <NavItem key={item.name} item={item} onNavigate={onNavigate} />
        ))}
      </nav>

      {/*
        Settings is pinned rather than sitting in the scroll list. It is
        account-level configuration, not daily work, and pinning it stops it
        competing for attention with the things an operator actually opens each
        morning — while keeping it in the same place every time they need it.
      */}
      {/* isAdmin, not !isStaff. Both read the same today because role is always
          resolved to 'admin' or 'staff' before an authed screen renders — but
          the two forms disagree on a null role, and this one errs toward hiding
          a door rather than showing one that might not open. The account menu
          in Layout uses the same test. */}
      {isAdmin(role) && (
        <div className="shrink-0 border-t border-white/10 px-2 py-2">
          <NavItem
            item={{ name: 'Settings', href: '/settings', icon: Settings }}
            onNavigate={onNavigate}
          />
        </div>
      )}

      <BuildStamp />
    </div>
  );
}

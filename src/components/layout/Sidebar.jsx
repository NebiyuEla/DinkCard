import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  ArrowDownUp,
  Bell,
  ChevronLeft,
  ChevronRight,
  CreditCard,
  HeadphonesIcon,
  LayoutDashboard,
  LogOut,
  PlusCircle,
  Settings,
  ShieldCheck,
  UserRound,
  Wallet
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient } from '@/api/client';
import BrandLogo from '@/components/BrandLogo';
import ThemeToggle from '@/components/ThemeToggle';

const navItems = [
  { label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Add Money', path: '/add-money', icon: PlusCircle },
  { label: 'Service Balance', path: '/wallet', icon: Wallet },
  { label: 'My Cards', path: '/cards', icon: CreditCard },
  { label: 'Transactions', path: '/transactions', icon: ArrowDownUp },
  { label: 'KYC Verification', path: '/kyc', icon: ShieldCheck },
  { label: 'Support', path: '/support', icon: HeadphonesIcon },
  { label: 'Notifications', path: '/notifications', icon: Bell },
  { label: 'Account', path: '/account', icon: UserRound }
];

const mobileNavItems = [
  { label: 'Home', path: '/dashboard', icon: LayoutDashboard },
  { label: 'Add', path: '/add-money', icon: PlusCircle },
  { label: 'Cards', path: '/cards', icon: CreditCard },
  { label: 'Alerts', path: '/notifications', icon: Bell },
  { label: 'Account', path: '/account', icon: UserRound }
];

function isPathActive(pathname, itemPath) {
  return pathname === itemPath || (itemPath !== '/dashboard' && pathname.startsWith(itemPath));
}

export default function Sidebar({ user, unreadCount = 0 }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const isAdmin = ['support', 'support_response', 'kyc_checker', 'admin', 'superadmin'].includes(user?.role);

  return (
    <>
      <aside className={cn(
        'fixed left-0 top-0 z-40 hidden h-dvh flex-col overflow-hidden border-r border-border bg-card transition-all duration-300 lg:flex',
        collapsed ? 'w-[72px]' : 'w-64'
      )}>
        <div className="flex h-16 items-center border-b border-border px-4">
          {!collapsed ? (
            <BrandLogo to="/dashboard" imageClassName="h-8 w-8 rounded-lg" />
          ) : (
            <BrandLogo to="/dashboard" className="mx-auto" imageClassName="h-8 w-8 rounded-lg" showLabel={false} />
          )}
        </div>

        <nav className="flex-1 space-y-1 overflow-hidden px-3 py-4">
          {navItems.map((item) => {
            const isActive = isPathActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                title={collapsed ? item.label : undefined}
                aria-label={item.label}
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  isActive ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <item.icon className={cn('h-5 w-5 shrink-0', isActive && 'text-primary')} />
                {!collapsed && <span className="truncate">{item.label}</span>}
                {!collapsed && item.label === 'Notifications' && unreadCount > 0 && (
                  <Badge className="ml-auto bg-primary px-1.5 py-0 text-xs text-primary-foreground">{unreadCount}</Badge>
                )}
              </Link>
            );
          })}

          {isAdmin && (
            <>
              <div className={cn('pb-2 pt-4', collapsed ? 'px-0' : 'px-3')}>
                {!collapsed ? <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Admin</p> : <div className="border-t border-border" />}
              </div>
              <Link
                to="/admin"
                title={collapsed ? 'Admin Panel' : undefined}
                aria-label="Admin Panel"
                className={cn(
                  'flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-all',
                  location.pathname.startsWith('/admin') ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:bg-secondary hover:text-foreground'
                )}
              >
                <Settings className="h-5 w-5 shrink-0" />
                {!collapsed && <span>Admin Panel</span>}
              </Link>
            </>
          )}
        </nav>

        <div className="space-y-2 border-t border-border p-3">
          <div className={cn('flex', collapsed ? 'justify-center' : 'justify-start')}>
            <ThemeToggle compact={collapsed} className={collapsed ? '' : 'w-full justify-start'} />
          </div>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-secondary hover:text-foreground"
            onClick={() => setCollapsed(!collapsed)}
            title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {collapsed ? <ChevronRight className="mx-auto h-4 w-4" /> : <><ChevronLeft className="h-4 w-4" /><span>Collapse</span></>}
          </button>
          <button
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-sm text-muted-foreground transition-all hover:bg-destructive/10 hover:text-destructive"
            onClick={() => apiClient.auth.logout('/')}
            title={collapsed ? 'Sign Out' : undefined}
          >
            <LogOut className="h-4 w-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>

      <nav className="fixed inset-x-4 bottom-[calc(0.75rem+env(safe-area-inset-bottom))] z-50 rounded-[24px] border border-border/80 bg-card/95 p-1.5 shadow-2xl shadow-black/30 backdrop-blur-xl lg:hidden">
        <div className="grid grid-cols-5 gap-1">
          {mobileNavItems.map((item) => {
            const isActive = isPathActive(location.pathname, item.path);
            return (
              <Link
                key={item.path}
                to={item.path}
                className={cn(
                  'relative flex min-h-[52px] flex-col items-center justify-center gap-1 rounded-[19px] px-1 text-[10px] font-semibold transition-all active:scale-95',
                  isActive
                    ? 'bg-secondary text-foreground shadow-sm'
                    : 'text-muted-foreground hover:bg-secondary/70'
                )}
              >
                {isActive && <span className="absolute inset-x-5 top-1 h-0.5 rounded-full bg-primary/80" />}
                <item.icon className="h-[18px] w-[18px]" />
                <span className="leading-none">{item.label}</span>
                {item.label === 'Alerts' && unreadCount > 0 && (
                  <span className="absolute right-3 top-2 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] text-primary-foreground">
                    {unreadCount > 9 ? '9+' : unreadCount}
                  </span>
                )}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}

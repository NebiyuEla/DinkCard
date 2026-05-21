import React, { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  LayoutDashboard, Wallet, CreditCard, PlusCircle, ArrowDownUp,
  ShieldCheck, HeadphonesIcon, Bell, Settings, ChevronLeft,
  ChevronRight, LogOut, Menu, X } from
'lucide-react';
import { Badge } from '@/components/ui/badge';
import { cn } from '@/lib/utils';
import { apiClient } from '@/api/client';

const navItems = [
{ label: 'Dashboard', path: '/dashboard', icon: LayoutDashboard },
{ label: 'Add Money', path: '/add-money', icon: PlusCircle },
{ label: 'Service Balance', path: '/wallet', icon: Wallet },
{ label: 'My Cards', path: '/cards', icon: CreditCard },
{ label: 'Transactions', path: '/transactions', icon: ArrowDownUp },
{ label: 'KYC Verification', path: '/kyc', icon: ShieldCheck },
{ label: 'Support', path: '/support', icon: HeadphonesIcon },
{ label: 'Notifications', path: '/notifications', icon: Bell }];


export default function Sidebar({ user, unreadCount = 0 }) {
  const location = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = ['admin', 'superadmin'].includes(user?.role);

  return (
    <>
      {/* Mobile toggle */}
      <button
        className="fixed top-4 left-4 z-50 lg:hidden p-2 rounded-lg bg-card border border-border"
        onClick={() => setMobileOpen(!mobileOpen)}>
        
        {mobileOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
      </button>

      {/* Backdrop */}
      {mobileOpen &&
      <div
        className="fixed inset-0 bg-black/50 z-40 lg:hidden"
        onClick={() => setMobileOpen(false)} />

      }

      {/* Sidebar */}
      <aside className={cn(
        "fixed top-0 left-0 h-full z-40 bg-card border-r border-border flex flex-col transition-all duration-300",
        collapsed ? "w-[72px]" : "w-64",
        mobileOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
      )}>
        {/* Logo */}
        <div className="h-16 flex items-center px-4 border-b border-border">
          {!collapsed &&
          <div className="flex items-center gap-2">
              <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center">
                <CreditCard className="w-4 h-4 text-primary-foreground" />
              </div>
              <span className="font-bold text-lg tracking-tight">DinkCard</span>
            </div>
          }
          {collapsed &&
          <div className="w-8 h-8 rounded-lg bg-primary flex items-center justify-center mx-auto">
              <CreditCard className="w-4 h-4 text-primary-foreground" />
            </div>
          }
        </div>

        {/* Nav items */}
        <nav className="flex-1 py-4 px-3 space-y-1 overflow-y-auto">
          {navItems.map((item) => {
            const isActive = location.pathname === item.path;
            return (
              <Link
                key={item.path}
                to={item.path}
                onClick={() => setMobileOpen(false)}
                className={cn(
                  "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                  isActive ?
                  "bg-primary/10 text-primary" :
                  "text-muted-foreground hover:text-foreground hover:bg-secondary"
                )}>
                
                <item.icon className={cn("w-5 h-5 shrink-0", isActive && "text-primary")} />
                {!collapsed &&
                <span className="truncate">{item.label}</span>
                }
                {!collapsed && item.label === 'Notifications' && unreadCount > 0 &&
                <Badge className="ml-auto bg-primary text-primary-foreground text-xs px-1.5 py-0">
                    {unreadCount}
                  </Badge>
                }
              </Link>);

          })}

          {isAdmin &&
          <>
              <div className={cn("pt-4 pb-2", collapsed ? "px-0" : "px-3")}>
                {!collapsed && <p className="text-xs text-muted-foreground font-semibold uppercase tracking-wider">Admin</p>}
                {collapsed && <div className="border-t border-border" />}
              </div>
              <Link
              to="/admin"
              onClick={() => setMobileOpen(false)}
              className={cn(
                "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all",
                location.pathname.startsWith('/admin') ?
                "bg-primary/10 text-primary" :
                "text-muted-foreground hover:text-foreground hover:bg-secondary"
              )}>
              
                <Settings className="w-5 h-5 shrink-0" />
                {!collapsed && <span>Admin Panel</span>}
              </Link>
            </>
          }
        </nav>

        {/* User / collapse */}
        <div className="border-t border-border p-3 space-y-2">
          <button
            className="hidden lg:flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-foreground hover:bg-secondary transition-all"
            onClick={() => setCollapsed(!collapsed)}>
            
            {collapsed ? <ChevronRight className="w-4 h-4 mx-auto" /> :
            <>
                <ChevronLeft className="w-4 h-4" />
                <span>Collapse</span>
              </>
            }
          </button>
          <button
            className="flex items-center gap-2 w-full px-3 py-2 rounded-lg text-sm text-muted-foreground hover:text-destructive hover:bg-destructive/10 transition-all"
            onClick={() => apiClient.auth.logout('/')}>
            
            <LogOut className="w-4 h-4 shrink-0" />
            {!collapsed && <span>Sign Out</span>}
          </button>
        </div>
      </aside>
    </>);

}


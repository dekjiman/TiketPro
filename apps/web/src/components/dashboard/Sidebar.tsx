'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MenuItem } from './roleConfig';

interface SidebarProps {
  menu: MenuItem[];
  role: string;
  mobileOpen: boolean;
  onMobileOpenChange: (open: boolean) => void;
}

export function Sidebar({ menu, role, mobileOpen, onMobileOpenChange }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const brandHref = role === 'CUSTOMER' ? '/' : '/';

  const isActive = (path: string) => {
    if (path === pathname) return true;
    
    // For exact match on the root role path (e.g., /admin)
    if (path === `/${role.toLowerCase()}`) {
      return pathname === path;
    }
    
    // For subpaths, ensure it matches a directory boundary
    // e.g., /admin/users should match /admin/users but not /admin/users/123 if there's a specific menu for it,
    // actually, it should match /admin/users and /admin/users/123, but not /admin/users-list
    return pathname.startsWith(`${path}/`);
  };

  const NavItem = ({ item }: { item: MenuItem }) => {
    const active = isActive(item.path);
    const Icon = item.icon;

    return (
      <Link
        href={item.path}
        onClick={() => onMobileOpenChange(false)}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
          active
            ? 'bg-emerald-700 dark:bg-emerald-600 text-white shadow-md'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${active ? '' : 'text-emerald-700 dark:text-emerald-400'}`} />
        {!collapsed && (
          <span className="font-medium text-sm truncate">{item.label}</span>
        )}
        {collapsed && (
          <div className="absolute left-full ml-2 px-2 py-1 bg-slate-900 text-white text-xs rounded opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
            {item.label}
          </div>
        )}
      </Link>
    );
  };

  return (
    <>
      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => onMobileOpenChange(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-50 h-[100svh] bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 w-72 transform ${
          mobileOpen ? 'translate-x-0' : '-translate-x-full'
        } lg:translate-x-0 lg:sticky lg:top-0 lg:z-auto lg:h-screen ${collapsed ? 'lg:w-16' : 'lg:w-64'}`}
      >
        {/* Mobile Close Button */}
        <div className="lg:hidden flex justify-end p-4">
          <button
            onClick={() => onMobileOpenChange(false)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brand Header */}
        <Link
          href={brandHref}
          onClick={() => onMobileOpenChange(false)}
          className="flex items-center gap-3 px-4 py-5 border-b border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
        >
          <div className="w-9 h-9 rounded-lg bg-emerald-700 dark:bg-emerald-600 flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">TP</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-emerald-700 dark:text-emerald-400 text-lg truncate" style={{ fontFamily: 'Manrope' }}>
                TiketPro
              </span>
              <span className="text-xs text-slate-500 capitalize truncate">
                {role.replace('_', ' ')}
              </span>
            </div>
          )}
        </Link>

        {/* Navigation Menu */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          {menu.map((item) => (
            <div key={item.path} className="relative">
              <NavItem item={item} />
            </div>
          ))}
        </nav>

        {/* Collapse Toggle */}
        <div className="px-3 py-4 border-t border-slate-200 dark:border-slate-700">
          <button
            onClick={() => setCollapsed(!collapsed)}
            className="flex items-center gap-3 px-3 py-2 w-full text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800 rounded-lg transition-colors"
          >
            {collapsed ? (
              <ChevronRight className="w-5 h-5" />
            ) : (
              <>
                <ChevronLeft className="w-5 h-5" />
                <span className="font-medium text-sm">Collapse</span>
              </>
            )}
          </button>
        </div>
      </aside>
    </>
  );
}

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Menu, X, ChevronLeft, ChevronRight } from 'lucide-react';
import type { MenuItem } from './roleConfig';

interface SidebarProps {
  menu: MenuItem[];
  role: string;
}

export function Sidebar({ menu, role }: SidebarProps) {
  const pathname = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const isActive = (path: string) => {
    if (path === `/${role.toLowerCase()}`) {
      return pathname === path;
    }
    return pathname.startsWith(path);
  };

  const NavItem = ({ item }: { item: MenuItem }) => {
    const active = isActive(item.path);
    const Icon = item.icon;

    return (
      <Link
        href={item.path}
        onClick={() => setMobileOpen(false)}
        className={`group relative flex items-center gap-3 px-3 py-2.5 rounded-lg transition-all duration-200 ${
          active
            ? 'bg-[#065F46] text-white shadow-md'
            : 'text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800'
        }`}
      >
        <Icon className={`w-5 h-5 flex-shrink-0 ${active ? '' : 'text-[#065F46] dark:text-emerald-400'}`} />
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
      {/* Mobile Toggle Button */}
      <button
        onClick={() => setMobileOpen(true)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-lg shadow-md"
      >
        <Menu className="w-5 h-5 text-slate-600" />
      </button>

      {/* Mobile Overlay */}
      {mobileOpen && (
        <div
          className="lg:hidden fixed inset-0 z-40 bg-black/50 backdrop-blur-sm"
          onClick={() => setMobileOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={`sticky top-0 h-screen bg-white dark:bg-slate-800 border-r border-slate-200 dark:border-slate-700 flex flex-col transition-all duration-300 ${
          collapsed ? 'w-16' : 'w-64'
        }`}
      >
        {/* Mobile Close Button */}
        <div className="lg:hidden flex justify-end p-4">
          <button
            onClick={() => setMobileOpen(false)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Brand Header */}
        <div className="flex items-center gap-3 px-4 py-5 border-b border-slate-200 dark:border-slate-700">
          <div className="w-9 h-9 rounded-lg bg-[#065F46] flex items-center justify-center flex-shrink-0">
            <span className="text-white font-bold text-sm">TP</span>
          </div>
          {!collapsed && (
            <div className="flex flex-col min-w-0">
              <span className="font-bold text-[#065F46] text-lg truncate" style={{ fontFamily: 'Manrope' }}>
                TiketPro
              </span>
              <span className="text-xs text-slate-500 capitalize truncate">
                {role.replace('_', ' ')}
              </span>
            </div>
          )}
        </div>

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
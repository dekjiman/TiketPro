'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Moon, Sun, ChevronRight, Menu, Home } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/components/ThemeProvider';

interface Breadcrumb {
  label: string;
  path?: string;
}

interface NavbarProps {
  breadcrumbs?: Breadcrumb[];
  onMobileToggle?: () => void;
}

export function Navbar({ breadcrumbs = [], onMobileToggle }: NavbarProps) {
  const pathname = usePathname();
  const { user, logout, _hasHydrated } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarRetryCount, setAvatarRetryCount] = useState(0);

  const handleAvatarError = () => {
    if (avatarRetryCount < 2) {
      setTimeout(() => setAvatarRetryCount(prev => prev + 1), 1000 * (avatarRetryCount + 1));
    } else {
      setAvatarError(true);
    }
  };

  const avatarSrc = user?.avatar;
  const showAvatar = avatarSrc && avatarSrc.length > 0 && !avatarError;
  const showFallback = !showAvatar;

  return (
    <header className="sticky top-0 z-30 h-16 bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between px-4 lg:px-6">
      {/* Left Side */}
      <div className="flex items-center gap-4">
        {/* Logo Link to Landing Page */}
        <Link href="/" className="text-xl font-bold text-emerald-600 hidden sm:block">
          TiketPro
        </Link>

        <button
          onClick={onMobileToggle}
          className="lg:hidden p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg"
        >
          <Menu className="w-5 h-5 text-slate-600" />
        </button>

        {/* Breadcrumbs */}
        <nav className="flex items-center gap-1.5 text-sm text-slate-500">
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((crumb, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {crumb.path ? (
                  <Link href={crumb.path} className="hover:text-[#065F46] transition-colors">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-900 dark:text-white font-medium">{crumb.label}</span>
                )}
              </div>
            ))
          ) : (
            <span className="text-slate-900 dark:text-white capitalize">
              {pathname.split('/').filter(Boolean).join(' / ')}
            </span>
          )}
        </nav>
      </div>

      {/* Right Side */}
      <div className="flex items-center gap-1">
        {/* Theme Toggle */}
        <button
          onClick={toggleTheme}
          className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
        >
          {theme === 'light' ? (
            <Moon className="w-5 h-5 text-slate-600" />
          ) : (
            <Sun className="w-5 h-5 text-slate-400" />
          )}
        </button>

        {/* Notifications */}
        <button className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors relative">
          <Bell className="w-5 h-5 text-slate-600" />
          <span className="absolute top-1.5 right-1.5 w-2 h-2 bg-red-500 rounded-full" />
        </button>

        {/* User Dropdown */}
        <div className="relative ml-2">
          <button
            onClick={() => setDropdownOpen(!dropdownOpen)}
            className="flex items-center gap-2 p-1.5 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors"
          >
            {showAvatar ? (
              <img 
                key={avatarRetryCount}
                src={avatarSrc} 
                alt={user?.name || 'User'}
                width={32}
                height={32}
                className="w-8 h-8 rounded-full object-cover"
                onError={handleAvatarError}
              />
            ) : (
              <div className="w-8 h-8 rounded-full bg-[#065F46] flex items-center justify-center flex-shrink-0">
                <span className="text-white text-sm font-medium">
                  {user?.name?.charAt(0)?.toUpperCase() || 'U'}
                </span>
              </div>
            )}
            <span className="hidden md:block text-sm font-medium text-slate-700 dark:text-slate-200 truncate max-w-[100px]">
              {user?.name?.split(' ')[0]}
            </span>
          </button>

          {dropdownOpen && (
            <>
              <div
                className="fixed inset-0 z-40"
                onClick={() => setDropdownOpen(false)}
              />
              <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg py-2 z-50">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700">
                  <p className="font-semibold text-sm text-slate-900 dark:text-white truncate">
                    {user?.name}
                  </p>
                  <p className="text-xs text-slate-500 truncate">{user?.email}</p>
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-[#065F46]/10 text-[#065F46] rounded-full capitalize">
                    {user?.role?.replace('_', ' ')}
                  </span>
                </div>
                <div className="py-1">
                  <Link
                    href="/"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    🏠 Landing Page
                  </Link>
                  {user?.role === 'EO_ADMIN' || user?.role === 'EO_STAFF' ? (
                    <Link
                      href="/eo/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      Profil EO
                    </Link>
                  ) : (
                    <Link
                      href="/dashboard/profile"
                      onClick={() => setDropdownOpen(false)}
                      className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                    >
                      Profile
                    </Link>
                  )}
                  <Link
                    href="/profile/security"
                    onClick={() => setDropdownOpen(false)}
                    className="flex items-center gap-3 px-4 py-2 text-sm text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-700"
                  >
                    Security
                  </Link>
                </div>
                <div className="border-t border-slate-200 dark:border-slate-700 pt-1">
                  <button
                    onClick={async () => {
                      setDropdownOpen(false);
                      await logout();
                    }}
                    className="flex items-center gap-3 w-full px-4 py-2 text-sm text-red-600 hover:bg-red-50"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>
    </header>
  );
}
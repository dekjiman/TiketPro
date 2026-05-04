'use client';

import { useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { cn } from '@/lib/utils';
import { Button } from '@/components/ui';
import { getRoleConfig, getDefaultDashboard } from '@/components/dashboard/roleConfig';
import {
  type LucideIcon,
  Menu,
  X,
  Sun,
  Moon,
  User,
  LayoutDashboard,
  LogOut,
  ChevronRight,
  ChevronDown,
  Sparkles,
  CalendarDays,
  Shield,
  BadgeInfo,
} from 'lucide-react';
import { useTheme } from '@/components/ThemeProvider';

type NavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
};

const publicLinks: NavItem[] = [{ href: '/events', label: 'Events', icon: CalendarDays }];

export function PublicNavbar() {
  const router = useRouter();
  const pathname = usePathname();
  const { user, isLoggedIn, logout } = useAuthStore();
  const { theme, toggleTheme } = useTheme();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [desktopDropdownOpen, setDesktopDropdownOpen] = useState<'user' | null>(null);
  const [mobileDropdownOpen, setMobileDropdownOpen] = useState<'user' | null>(null);
  const desktopNavRef = useRef<HTMLElement | null>(null);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  const isActive = (href: string) => pathname === href || pathname?.startsWith(`${href}/`);

  const dashboardHref = user ? getDefaultDashboard(user.role) : '/dashboard';
  const roleConfig = user ? getRoleConfig(user.role) : null;

  const userShortcutLinks: NavItem[] = (() => {
    if (!user || !roleConfig) return [];

    // Keep the public navbar dropdown tight: show only a couple of role-relevant shortcuts.
    const shortcuts = roleConfig.menu
      .filter(item => item.path !== dashboardHref && item.label !== 'Dashboard')
      .slice(0, 2)
      .map(item => ({ href: item.path, label: item.label, icon: item.icon }));

    return [
      { href: dashboardHref, label: 'Dashboard', icon: LayoutDashboard },
      ...shortcuts,
    ];
  })();

  const userProfileLinks: NavItem[] = [
    { href: '/profile', label: 'Profile', icon: BadgeInfo },
    { href: '/profile/security', label: 'Security', icon: Shield },
  ];

  const isUserSectionActive = () =>
    [...userShortcutLinks, ...userProfileLinks].some(link => isActive(link.href));

  const closeDesktopDropdown = () => setDesktopDropdownOpen(null);
  const closeMobileDropdown = () => setMobileDropdownOpen(null);

  useEffect(() => {
    const handlePointerDown = (event: MouseEvent | TouchEvent) => {
      if (!desktopNavRef.current?.contains(event.target as Node)) {
        closeDesktopDropdown();
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    document.addEventListener('touchstart', handlePointerDown);

    return () => {
      document.removeEventListener('mousedown', handlePointerDown);
      document.removeEventListener('touchstart', handlePointerDown);
    };
  }, []);

  const initials = (user?.name || 'U')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(part => part[0]?.toUpperCase())
    .join('');

  return (
    <header className="sticky top-0 z-40 border-b border-white/10 bg-white/85 shadow-[0_10px_30px_rgba(15,23,42,0.06)] backdrop-blur-xl dark:border-slate-800/80 dark:bg-slate-950/80">
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <div className="flex h-20 items-center justify-between gap-4">
          <Link href="/" className="group flex items-center gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-gradient-to-br from-emerald-600 via-teal-600 to-cyan-600 text-white shadow-lg shadow-emerald-600/20 transition-transform duration-200 group-hover:scale-105">
              <Sparkles className="h-5 w-5" />
            </span>
            <span className="flex flex-col leading-none">
              <span className="text-lg font-extrabold tracking-tight text-slate-900 dark:text-white">
                TiketPro
              </span>
              <span className="text-xs font-medium text-slate-500 dark:text-slate-400">
                Event tickets, simplified
              </span>
            </span>
          </Link>

          <nav
            ref={desktopNavRef}
            className="hidden md:flex items-center gap-2 rounded-full border border-slate-200/80 bg-white/70 px-2 py-2 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60"
          >
            <button
              type="button"
              onClick={toggleTheme}
              className="inline-flex items-center justify-center rounded-full p-2 text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white transition-colors"
              aria-label="Toggle theme"
              title={theme === 'light' ? 'Aktifkan mode gelap' : 'Aktifkan mode terang'}
            >
              {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
            </button>

            {publicLinks.map(link => {
              const LinkIcon = link.icon;
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={cn(
                    'rounded-full px-4 py-2 text-sm font-medium transition-all inline-flex items-center gap-2',
                    isActive(link.href)
                      ? 'bg-emerald-600 text-white shadow-md shadow-emerald-600/20'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-800 dark:hover:text-white'
                  )}
                >
                  <LinkIcon className="h-4 w-4" />
                  {link.label}
                </Link>
              );
            })}

            {isLoggedIn && user ? (
              <>
                <div className="relative ml-2 flex items-center gap-3 border-l border-slate-200 pl-4 dark:border-slate-700">
                  <button
                    type="button"
                    onClick={() => setDesktopDropdownOpen(open => (open === 'user' ? null : 'user'))}
                    className={cn(
                      'flex items-center gap-3 rounded-full border px-3 py-2 text-left transition-all',
                      desktopDropdownOpen === 'user' || isUserSectionActive()
                        ? 'border-slate-300 bg-slate-100 dark:border-slate-700 dark:bg-slate-900'
                        : 'border-slate-200 bg-slate-50 hover:border-slate-300 hover:bg-slate-100 dark:border-slate-800 dark:bg-slate-900 dark:hover:border-slate-700'
                    )}
                    aria-expanded={desktopDropdownOpen === 'user'}
                    aria-haspopup="menu"
                  >
                    <div className="flex h-9 w-9 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
                      {initials || <User className="h-4 w-4" />}
                    </div>
                    <div className="min-w-0">
                      <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                        {user.name}
                      </div>
                      <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                        {user.role.replaceAll('_', ' ').toLowerCase()}
                      </div>
                    </div>
                    <ChevronDown
                      className={cn('h-4 w-4 text-slate-500 transition-transform dark:text-slate-400', desktopDropdownOpen === 'user' && 'rotate-180')}
                    />
                  </button>

                  {desktopDropdownOpen === 'user' && (
                    <div className="absolute right-0 top-full mt-3 w-72 overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-[0_24px_60px_rgba(15,23,42,0.16)] dark:border-slate-800 dark:bg-slate-950">
                      <div className="border-b border-slate-100 px-5 py-4 dark:border-slate-800">
                        <p className="text-xs font-semibold uppercase tracking-[0.24em] text-slate-400 dark:text-slate-500">
                          User Menu
                        </p>
                        <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                          Dashboard and profile shortcuts
                        </p>
                      </div>
                      <div className="p-2">
                        {[...userShortcutLinks, ...userProfileLinks].map(item => {
                          const ItemIcon = item.icon;

                          return (
                            <Link
                              key={item.href}
                              href={item.href}
                              onClick={closeDesktopDropdown}
                              className={cn(
                                'flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-medium transition-all',
                                isActive(item.href)
                                  ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white'
                                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-white'
                              )}
                            >
                              <span className="flex items-center gap-3">
                                <ItemIcon className="h-4 w-4" />
                                {item.label}
                              </span>
                              <ChevronRight className="h-4 w-4 opacity-50" />
                            </Link>
                          );
                        })}
                      </div>
                      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
                        <button
                          onClick={handleLogout}
                          className="flex w-full items-center gap-3 rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                        >
                          <LogOut className="h-4 w-4" />
                          Logout
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              </>
            ) : (
              <>
                <Button
                  onClick={() => router.push('/login')}
                  variant="ghost"
                  className="rounded-full px-5 text-slate-600 dark:text-slate-300"
                >
                  Login
                </Button>
                <Button onClick={() => router.push('/register')} className="rounded-full bg-emerald-600 px-5 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700">
                  Register
                </Button>
              </>
            )}
          </nav>

          <button
            onClick={() => {
              setMobileMenuOpen(prev => {
                const next = !prev;

                if (!next) {
                  closeMobileDropdown();
                }

                return next;
              });
            }}
            className="inline-flex h-11 w-11 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-700 shadow-sm transition-colors hover:bg-slate-50 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200 md:hidden"
            aria-label="Toggle navigation menu"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {mobileMenuOpen && (
          <div className="md:hidden pb-4">
            <div className="mt-3 rounded-3xl border border-slate-200 bg-white/95 p-4 shadow-lg shadow-slate-200/40 backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
              <nav className="flex flex-col gap-2">
                {publicLinks.map(link => {
                  const LinkIcon = link.icon;
                  return (
                    <Link
                      key={link.href}
                      href={link.href}
                      className={cn(
                        'flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold transition-all',
                        isActive(link.href)
                          ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300'
                          : 'text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900'
                      )}
                      onClick={() => setMobileMenuOpen(false)}
                    >
                      <span className="flex items-center gap-3">
                        <LinkIcon className="h-4 w-4" />
                        {link.label}
                      </span>
                      <ChevronRight className="h-4 w-4 opacity-60" />
                    </Link>
                  );
                })}

                {isLoggedIn && user ? (
                  <>
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="flex items-center justify-between rounded-2xl px-4 py-3 text-sm font-semibold text-slate-700 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <span className="flex items-center gap-3">
                        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        {theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
                      </span>
                    </button>

                    <div className="my-2 rounded-2xl border border-slate-200 bg-slate-50 p-3 dark:border-slate-800 dark:bg-slate-900">
                      <div className="mb-3 flex items-center gap-3">
                        <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-emerald-500 to-teal-600 text-sm font-bold text-white">
                          {initials || <User className="h-4 w-4" />}
                        </div>
                        <div className="min-w-0">
                          <div className="truncate text-sm font-semibold text-slate-900 dark:text-white">
                            {user.name}
                          </div>
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">
                            {user.email}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-1">
                        <div className="rounded-xl border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-950">
                            <button
                              type="button"
                              onClick={() => setMobileDropdownOpen(open => (open === 'user' ? null : 'user'))}
                              className={cn(
                                'flex w-full items-center justify-between rounded-xl px-3 py-2 text-sm font-medium transition-all',
                              mobileDropdownOpen === 'user' || isUserSectionActive()
                                  ? 'text-slate-900 dark:text-white'
                                  : 'text-slate-600 dark:text-slate-300'
                              )}
                            aria-expanded={mobileDropdownOpen === 'user'}
                            aria-haspopup="menu"
                          >
                            <span className="flex items-center gap-3">
                              <User className="h-4 w-4" />
                              User Menu
                            </span>
                            <ChevronDown className={cn('h-4 w-4 transition-transform', mobileDropdownOpen === 'user' && 'rotate-180')} />
                          </button>

                          {mobileDropdownOpen === 'user' && (
                            <div className="space-y-1 p-1">
                              {[...userShortcutLinks, ...userProfileLinks].map(item => {
                                const ItemIcon = item.icon;

                                return (
                                  <Link
                                    key={item.href}
                                    href={item.href}
                                    className={cn(
                                      'flex items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition-all',
                                      isActive(item.href)
                                        ? 'bg-slate-100 text-slate-900 dark:bg-slate-900 dark:text-white'
                                        : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-white'
                                    )}
                                    onClick={() => {
                                      setMobileMenuOpen(false);
                                      closeMobileDropdown();
                                    }}
                                  >
                                    <span className="flex items-center gap-3">
                                      <ItemIcon className="h-4 w-4" />
                                      {item.label}
                                    </span>
                                    <ChevronRight className="h-4 w-4 opacity-60" />
                                  </Link>
                                );
                              })}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <button
                      onClick={() => {
                        handleLogout();
                        setMobileMenuOpen(false);
                      }}
                      className="flex items-center gap-3 rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <LogOut className="h-4 w-4" />
                      Logout
                    </button>
                  </>
                ) : (
                  <div className="mt-2 grid gap-2">
                    <button
                      type="button"
                      onClick={toggleTheme}
                      className="flex items-center justify-between rounded-2xl px-4 py-3 text-left text-sm font-semibold text-slate-700 transition-all hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-900"
                    >
                      <span className="flex items-center gap-3">
                        {theme === 'light' ? <Moon className="h-4 w-4" /> : <Sun className="h-4 w-4" />}
                        {theme === 'light' ? 'Mode Gelap' : 'Mode Terang'}
                      </span>
                    </button>

                    <Button
                      onClick={() => {
                        router.push('/login');
                        setMobileMenuOpen(false);
                      }}
                      variant="ghost"
                      className="justify-start rounded-2xl px-4 text-slate-700 dark:text-slate-300"
                    >
                      Login
                    </Button>
                    <Button
                      onClick={() => {
                        router.push('/register');
                        setMobileMenuOpen(false);
                      }}
                      className="rounded-2xl bg-emerald-600 px-4 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
                    >
                      Register
                    </Button>
                  </div>
                )}
              </nav>
            </div>
          </div>
        )}
      </div>
    </header>
  );
}

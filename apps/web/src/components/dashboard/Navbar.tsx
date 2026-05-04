'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Bell, LogOut, Moon, Sun, ChevronRight, Menu, ExternalLink, CheckCheck } from 'lucide-react';
import { useAuthStore } from '@/store/authStore';
import { useTheme } from '@/components/ThemeProvider';
import { api, getApiError } from '@/lib/api';
import { useToast } from '@/components/ui';

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
  const toast = useToast();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [avatarRetryCount, setAvatarRetryCount] = useState(0);
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);

  const notificationHrefBase = useMemo(() => {
    if (user?.role === 'SUPER_ADMIN') return '/admin/notifications';
    if (user?.role === 'EO_ADMIN' || user?.role === 'EO_STAFF') return '/eo/notifications';
    return '/dashboard';
  }, [user?.role]);

  const eventManagePath = (eventId: string) => {
    if (user?.role === 'SUPER_ADMIN') return `/admin/events?eventId=${encodeURIComponent(eventId)}&openDiscussion=1`;
    return `/eo/events/${encodeURIComponent(eventId)}/manage?tab=diskusi`;
  };

  const loadNotifications = async () => {
    if (!user) return;
    try {
      const res = await api.get('/api/notifications?limit=7');
      setNotifications(res.data?.data || []);
      setUnreadCount(res.data?.meta?.unread || 0);
    } catch {
      // keep navbar stable
    }
  };

  useEffect(() => {
    if (_hasHydrated && user) loadNotifications();
  }, [_hasHydrated, user?.id]);

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

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/notifications/${id}/read`);
      await loadNotifications();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      await loadNotifications();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

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
        <nav className="flex items-center gap-1.5 text-sm text-slate-500 min-w-0 max-w-[58vw] sm:max-w-none overflow-hidden">
          {breadcrumbs.length > 0 ? (
            breadcrumbs.map((crumb, i) => (
              <div key={i} className="flex items-center gap-1.5">
                {i > 0 && <ChevronRight className="w-3 h-3" />}
                {crumb.path ? (
                  <Link href={crumb.path} className="hover:text-emerald-700 dark:hover:text-emerald-400 transition-colors truncate max-w-[18ch] sm:max-w-none">
                    {crumb.label}
                  </Link>
                ) : (
                  <span className="text-slate-900 dark:text-white font-medium truncate max-w-[22ch] sm:max-w-none">
                    {crumb.label}
                  </span>
                )}
              </div>
            ))
          ) : (
            <span className="text-slate-900 dark:text-white capitalize truncate">
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
        <div className="relative">
          <button
            onClick={() => setNotifOpen((v) => !v)}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg transition-colors relative"
            title="Notifikasi"
          >
            <Bell className="w-5 h-5 text-slate-600" />
            {unreadCount > 0 && (
              <span className="absolute -top-0.5 -right-0.5 min-w-[18px] h-[18px] px-1 rounded-full bg-red-500 text-white text-[10px] leading-[18px] text-center font-bold">
                {unreadCount > 99 ? '99+' : unreadCount}
              </span>
            )}
          </button>
          {notifOpen && (
            <>
              <div className="fixed inset-0 z-40" onClick={() => setNotifOpen(false)} />
              <div className="absolute right-0 mt-2 w-[360px] max-w-[90vw] bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg z-50 overflow-hidden">
                <div className="px-4 py-3 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">Notifikasi</p>
                  <button onClick={markAllRead} className="text-xs text-emerald-700 hover:underline inline-flex items-center gap-1">
                    <CheckCheck className="w-3.5 h-3.5" /> Tandai semua
                  </button>
                </div>
                <div className="max-h-[360px] overflow-auto">
                  {notifications.length === 0 ? (
                    <div className="px-4 py-8 text-sm text-slate-500 text-center">Belum ada notifikasi.</div>
                  ) : (
                    notifications.map((n) => (
                      <div key={n.id} className={`px-4 py-3 border-b border-slate-100 dark:border-slate-700 ${n.isRead ? 'bg-white dark:bg-slate-800' : 'bg-emerald-50/40 dark:bg-emerald-900/10'}`}>
                        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{n.title}</p>
                        <p className="text-xs text-slate-600 dark:text-slate-300 mt-1">{n.body}</p>
                        <div className="mt-2 flex items-center justify-between gap-3">
                          {n.data?.eventId ? (
                            <Link
                              href={eventManagePath(n.data.eventId)}
                              onClick={() => {
                                setNotifOpen(false);
                                void markRead(n.id);
                              }}
                              className="text-xs text-blue-600 hover:underline inline-flex items-center"
                            >
                              Buka Event <ExternalLink className="w-3 h-3 ml-1" />
                            </Link>
                          ) : n.data?.transferId ? (
                            <Link
                              href={`/dashboard/my-tickets/transfers/${n.data.transferId}`}
                              onClick={() => {
                                setNotifOpen(false);
                                void markRead(n.id);
                              }}
                              className="text-xs text-emerald-600 font-semibold hover:underline inline-flex items-center"
                            >
                              Terima Tiket <ChevronRight className="w-3 h-3 ml-0.5" />
                            </Link>
                          ) : (
                            <span className="text-xs text-slate-400">-</span>
                          )}
                          {!n.isRead && (
                            <button onClick={() => markRead(n.id)} className="text-xs text-emerald-700 hover:underline">
                              Tandai dibaca
                            </button>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
                <div className="px-4 py-2 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/30">
                  <Link href={notificationHrefBase} onClick={() => setNotifOpen(false)} className="text-xs text-blue-600 hover:underline">
                    Lihat semua notifikasi
                  </Link>
                </div>
              </div>
            </>
          )}
        </div>

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
              <div className="w-8 h-8 rounded-full bg-emerald-700 dark:bg-emerald-600 flex items-center justify-center flex-shrink-0">
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
                  <span className="inline-block mt-1 px-2 py-0.5 text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 rounded-full capitalize">
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

'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Button } from '@/components/ui';
import { Menu, X, User, LogOut, Ticket, LayoutDashboard } from 'lucide-react';

export function PublicNavbar() {
  const router = useRouter();
  const { user, isLoggedIn, logout } = useAuthStore();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  const handleLogout = () => {
    logout();
    router.push('/');
  };

  return (
    <header className="bg-white dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 sticky top-0 z-40">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo */}
          <Link href="/" className="text-2xl font-bold text-emerald-600">
            TiketPro
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden md:flex items-center gap-4">
            <Link href="/events" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm">
              Events
            </Link>

            {isLoggedIn && user ? (
              <>
                <Link href="/dashboard" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm">
                  Dashboard
                </Link>
                <Link href="/profile/tickets" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm">
                  My Tickets
                </Link>
                <Link href="/profile" className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm">
                  Profile
                </Link>
                <div className="flex items-center gap-2 ml-4 pl-4 border-l border-slate-200 dark:border-slate-600">
                  <div className="w-8 h-8 bg-emerald-100 rounded-full flex items-center justify-center">
                    <User className="w-4 h-4 text-emerald-600" />
                  </div>
                  <button
                    onClick={handleLogout}
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium text-sm"
                  >
                    Logout
                  </button>
                </div>
              </>
            ) : (
              <>
                <Button
                  onClick={() => router.push('/login')}
                  variant="ghost"
                  className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                >
                  Login
                </Button>
                <Button
                  onClick={() => router.push('/register')}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  Register
                </Button>
              </>
            )}
          </nav>

          {/* Mobile Menu Button */}
          <button
            onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
            className="md:hidden p-2 text-slate-600 dark:text-slate-300"
          >
            {mobileMenuOpen ? <X className="w-5 h-5" /> : <Menu className="w-5 h-5" />}
          </button>
        </div>

        {/* Mobile Menu */}
        {mobileMenuOpen && (
          <div className="md:hidden border-t border-slate-200 dark:border-slate-700 py-4">
            <nav className="flex flex-col gap-4">
              <Link
                href="/events"
                className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium"
                onClick={() => setMobileMenuOpen(false)}
              >
                Events
              </Link>

              {isLoggedIn && user ? (
                <>
                  <Link
                    href="/dashboard"
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <LayoutDashboard className="w-4 h-4" />
                    Dashboard
                  </Link>
                  <Link
                    href="/profile/tickets"
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <Ticket className="w-4 h-4" />
                    My Tickets
                  </Link>
                  <Link
                    href="/profile"
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-2"
                    onClick={() => setMobileMenuOpen(false)}
                  >
                    <User className="w-4 h-4" />
                    Profile
                  </Link>
                  <button
                    onClick={() => {
                      handleLogout();
                      setMobileMenuOpen(false);
                    }}
                    className="text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white font-medium flex items-center gap-2 text-left"
                  >
                    <LogOut className="w-4 h-4" />
                    Logout
                  </button>
                </>
              ) : (
                <>
                  <Button
                    onClick={() => {
                      router.push('/login');
                      setMobileMenuOpen(false);
                    }}
                    variant="ghost"
                    className="justify-start text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white"
                  >
                    Login
                  </Button>
                  <Button
                    onClick={() => {
                      router.push('/register');
                      setMobileMenuOpen(false);
                    }}
                    className="bg-emerald-600 hover:bg-emerald-700 text-white w-full"
                  >
                    Register
                  </Button>
                </>
              )}
            </nav>
          </div>
        )}
      </div>
    </header>
  );
}
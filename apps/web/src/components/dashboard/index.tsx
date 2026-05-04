'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { Sidebar } from './Sidebar';
import { Navbar } from './Navbar';
import { ROLE_CONFIG } from './roleConfig';

interface DashboardLayoutProps {
  children: React.ReactNode;
  breadcrumbs?: { label: string; path?: string }[];
}

export function DashboardLayout({ children, breadcrumbs }: DashboardLayoutProps) {
  const router = useRouter();
  const { user, isLoggedIn, _hasHydrated } = useAuthStore();
  const [mounted, setMounted] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (mounted && _hasHydrated && !isLoggedIn) {
      router.push('/login');
    }
  }, [mounted, _hasHydrated, isLoggedIn, router]);

  if (!mounted || !_hasHydrated || !isLoggedIn || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[#065F46] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      </div>
    );
  }

  const config = ROLE_CONFIG[user.role];
  if (!config) {
    router.push('/dashboard');
    return null;
  }

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-900">
      {/* Sidebar - Fixed Left */}
      <Sidebar menu={config.menu} role={user.role} />
      
      {/* Main Content - Right Side */}
      <div className="flex-1 flex flex-col w-full">
        {/* Navbar - Top */}
        <Navbar
          breadcrumbs={breadcrumbs}
          onMobileToggle={() => setSidebarOpen(true)}
        />
        
        {/* Page Content */}
        <main className="flex-1 p-4 lg:p-6 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}
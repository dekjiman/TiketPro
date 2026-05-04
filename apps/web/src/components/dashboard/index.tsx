'use client';

import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
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
  const pathname = usePathname();
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

  useEffect(() => {
    setSidebarOpen(false);
  }, [pathname]);

  if (!mounted || !_hasHydrated || !isLoggedIn || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[var(--bg)] text-[var(--text)]">
        <div className="flex flex-col items-center gap-4">
          <div className="w-10 h-10 border-3 border-[var(--primary)] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-[var(--muted-text)]">Memuat...</p>
        </div>
      </div>
    );
  }

  const config = ROLE_CONFIG[user.role];
  if (!config) {
    router.push('/dashboard');
    return null;
  }

  // Generate dynamic breadcrumbs
  let dynamicBreadcrumbs = breadcrumbs || [];
  
  if (dynamicBreadcrumbs.length === 1 && config) {
    // If only the root is provided (e.g. 'Admin'), try to find the specific subpage
    const rootLabel = dynamicBreadcrumbs[0].label;
    
    // Find the active menu item
    const activeItem = config.menu.find(item => {
      if (item.path === `/${user.role.toLowerCase()}`) {
        return pathname === item.path;
      }
      return pathname.startsWith(`${item.path}/`) || pathname === item.path;
    });

    if (activeItem && activeItem.label !== rootLabel && activeItem.label !== 'Dashboard') {
      dynamicBreadcrumbs = [
        { label: rootLabel, path: config.dashboard },
        { label: activeItem.label }
      ];
    }
  }

  return (
    <div className="flex min-h-screen bg-[var(--bg)] text-[var(--text)]">
      {/* Sidebar - Fixed Left */}
      <Sidebar menu={config.menu} role={user.role} mobileOpen={sidebarOpen} onMobileOpenChange={setSidebarOpen} />
      
      {/* Main Content - Right Side */}
      <div className="flex-1 flex flex-col w-full min-w-0">
        {/* Navbar - Top */}
        <Navbar
          breadcrumbs={dynamicBreadcrumbs}
          onMobileToggle={() => setSidebarOpen(true)}
        />
        
        {/* Page Content */}
        <main className="flex-1 overflow-auto bg-[var(--bg)] p-4 lg:p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

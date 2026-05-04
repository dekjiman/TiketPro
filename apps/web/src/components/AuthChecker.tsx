'use client';

import { useEffect, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore, type User } from '@/store/authStore';

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  EO_ADMIN: '/eo',
  EO_STAFF: '/eo',
  AFFILIATE: '/affiliate',
  RESELLER: '/reseller',
  CUSTOMER: '/dashboard',
};

const PUBLIC_ROUTES = [
  '/login',
  '/register',
  '/verify-email',
  '/forgot-password',
  '/reset-password',
  '/auth/pending-approval',
  '/auth/suspended',
];

async function fetchMe(): Promise<User | null> {
  const token = localStorage.getItem('token');
  if (!token) return null;
  try {
    const res = await api.get<User>('/api/auth/me');
    return res.data;
  } catch {
    return null;
  }
}

export function AuthChecker({ children }: { children: React.ReactNode }) {
  const { user, setUser, _hasHydrated } = useAuthStore();
  const pathname = usePathname();
  const router = useRouter();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const shouldFetch = mounted && _hasHydrated && !user && !!localStorage.getItem('token');

  const { isLoading, isSuccess, isError, data: fetchedUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: Infinity,
    gcTime: 1000 * 60 * 30,
    enabled: shouldFetch,
  });

  useEffect(() => {
    if (isSuccess && fetchedUser) {
      setUser(fetchedUser);
    } else if (isError) {
      localStorage.removeItem('token');
      localStorage.removeItem('user');
      setUser(null);
    }
  }, [isSuccess, isError, fetchedUser, setUser]);

   useEffect(() => {
     if (!isLoading && user) {
       // Users with PENDING_APPROVAL can only access the pending-approval page
       if (user.status === 'PENDING_APPROVAL') {
         if (pathname !== '/auth/pending-approval') {
           router.push('/auth/pending-approval');
         }
         return;
       }

       // Users with SUSPENDED or BANNED can only access the suspended page
       if (user.status === 'SUSPENDED' || user.status === 'BANNED') {
         if (pathname !== '/auth/suspended') {
           router.push('/auth/suspended');
         }
         return;
       }

       // Only fully active users are redirected from public routes to their dashboard
       if (PUBLIC_ROUTES.includes(pathname)) {
         const target = ROLE_DASHBOARD[user.role] || '/dashboard';
         router.push(target);
       }
     }
   }, [isLoading, user, pathname, router]);

  if (!mounted || !_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
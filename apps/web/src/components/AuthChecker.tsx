'use client';

import { useEffect, useRef, useState } from 'react';
import { useRouter, usePathname } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore, type User } from '@/store/authStore';

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  EO_ADMIN: '/eo',
  EO_STAFF: '/eo/checkin',
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

const PROTECTED_PREFIXES = ['/dashboard', '/profile', '/admin', '/eo', '/affiliate', '/reseller'];

async function fetchMe(): Promise<User | null> {
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
  const lastRedirectRef = useRef<string | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  const isProtectedRoute = PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix));
  const shouldFetch = mounted && _hasHydrated && (isProtectedRoute || !!user);

  const { isLoading, isSuccess, isError, data: fetchedUser } = useQuery({
    queryKey: ['auth', 'me'],
    queryFn: fetchMe,
    retry: false,
    staleTime: 0,
    gcTime: 1000 * 60 * 30,
    refetchOnMount: 'always',
    enabled: shouldFetch,
  });

  useEffect(() => {
    if (isSuccess) {
      if (!fetchedUser) {
        localStorage.removeItem('user');
      }
      setUser(fetchedUser ?? null);
      return;
    }
    if (isError) {
      localStorage.removeItem('user');
      setUser(null);
    }
  }, [isSuccess, isError, fetchedUser, setUser]);

  const authResolved = !isLoading && (isSuccess || isError);
  const resolvedUser = authResolved ? fetchedUser ?? null : user;

   useEffect(() => {
     if (!authResolved) return;
     const safeReplace = (target: string) => {
       if (lastRedirectRef.current === target) return;
       lastRedirectRef.current = target;
       router.replace(target);
     };

     if (!resolvedUser && !PUBLIC_ROUTES.includes(pathname) && PROTECTED_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
       safeReplace(`/login?redirect=${encodeURIComponent(pathname)}`);
       return;
     }

     if (resolvedUser) {
       // Users with PENDING_APPROVAL can only access the pending-approval page
       if (resolvedUser.status === 'PENDING_APPROVAL') {
         if (pathname !== '/auth/pending-approval') {
           safeReplace('/auth/pending-approval');
         }
         return;
       }

       // Users with SUSPENDED or BANNED can only access the suspended page
       if (resolvedUser.status === 'SUSPENDED' || resolvedUser.status === 'BANNED') {
         if (pathname !== '/auth/suspended') {
           safeReplace('/auth/suspended');
         }
         return;
       }

       // Only fully active users are redirected from public routes to their dashboard
       if (PUBLIC_ROUTES.includes(pathname)) {
         const target = ROLE_DASHBOARD[resolvedUser.role] || '/dashboard';
         safeReplace(target);
       }
     }
   }, [authResolved, resolvedUser, pathname, router]);

  if (!mounted || !_hasHydrated) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Memuat...</p>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}

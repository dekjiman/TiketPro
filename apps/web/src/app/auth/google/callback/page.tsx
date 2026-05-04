'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { api } from '@/lib/api';

const ROLE_DASHBOARD: Record<string, string> = {
  SUPER_ADMIN: '/admin',
  EO_ADMIN: '/eo',
  EO_STAFF: '/eo',
  AFFILIATE: '/affiliate',
  RESELLER: '/reseller',
  CUSTOMER: '/dashboard',
};

export default function GoogleCallbackPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { setUser, checkAuth } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    const token = searchParams.get('token');
    const redirect = searchParams.get('redirect');

    if (!token) {
      setError('Invalid OAuth callback');
      return;
    }

    localStorage.setItem('token', token);
    document.cookie = `token=${token}; path=/; max-age=2592000`;

    checkAuth();
    
    const unsubscribe = useAuthStore.subscribe((state) => {
      if (state.user) {
        unsubscribe();
        const userJson = JSON.stringify(state.user);
        localStorage.setItem('user', userJson);
        document.cookie = `user=${encodeURIComponent(userJson)}; path=/; max-age=2592000`;
        
        if (redirect) {
          router.push(decodeURIComponent(redirect));
        } else {
          router.push(ROLE_DASHBOARD[state.user.role] || '/dashboard');
        }
      }
    });

    const timeout = setTimeout(() => {
      unsubscribe();
      setError('Failed to get user data');
      localStorage.removeItem('token');
      document.cookie = 'token=; path=/; max-age=0';
    }, 5000);

    return () => clearTimeout(timeout);
  }, [searchParams, router, checkAuth, setUser]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push('/login')} className="text-[#065F46]">
            Kembali ke Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Memproses login...</p>
      </div>
    </div>
  );
}
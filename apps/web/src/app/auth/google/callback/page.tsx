'use client';

import { useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';
import { API_URL } from '@/lib/api';

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
  const { setUser } = useAuthStore();
  const [error, setError] = useState('');

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      if (url.searchParams.has('token')) {
        url.searchParams.delete('token');
        window.history.replaceState({}, '', url.toString());
      }
    }

    const redirect = searchParams.get('redirect');
    const oauthError = searchParams.get('error');

    if (oauthError) {
      setError('Login Google gagal. Silakan coba lagi.');
      return;
    }

    const finalizeLogin = async () => {
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 8000);
        const meRes = await fetch(`${API_URL}/api/auth/me`, {
          credentials: 'include',
          signal: controller.signal,
        });
        clearTimeout(timeout);

        if (!meRes.ok) throw new Error('Failed to resolve session');
        const user = await meRes.json();

        setUser(user);

        const userJson = JSON.stringify(user);
        localStorage.setItem('user', userJson);
        document.cookie = `user=${encodeURIComponent(userJson)}; path=/; max-age=2592000`;

        if (redirect) {
          router.push(decodeURIComponent(redirect));
          return;
        }

        router.push(ROLE_DASHBOARD[user.role] || '/dashboard');
      } catch (err) {
        localStorage.removeItem('user');
        document.cookie = 'user=; path=/; max-age=0';
        setError('Failed to get user data');
      }
    };

    finalizeLogin();
  }, [searchParams, router, setUser]);

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <p className="text-red-600 mb-4">{error}</p>
          <button onClick={() => router.push('/login')} className="text-emerald-700 dark:text-emerald-400">
            Kembali ke Login
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center">
      <div className="flex flex-col items-center gap-4">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
        <p className="text-sm text-slate-500">Memproses login...</p>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export default function TwoFactorPage() {
  const router = useRouter();
  const { setUser } = useAuthStore();

  const [code, setCode] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [attempts, setAttempts] = useState(0);

  const tempToken = typeof window !== 'undefined' ? localStorage.getItem('2fa_temp') : null;

  useEffect(() => {
    if (!tempToken) {
      router.push('/login');
    }
  }, [tempToken, router]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !tempToken) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.post<{
        user: any;
        accessToken: string;
      }>('/api/auth/2fa/verify', {
        tempToken,
        code,
      });

      localStorage.removeItem('2fa_temp');
      localStorage.setItem('user', JSON.stringify(res.data.user));
      setUser(res.data.user);
      router.push('/dashboard');
    } catch (err) {
      const apiError = getApiError(err);
      if (apiError.code === 'INVALID_2FA_CODE') {
        setAttempts((a) => a + 1);
        if (attempts >= 4) {
          setError('Terlalu banyak percobaan. Silakan login ulang.');
          localStorage.removeItem('2fa_temp');
          setTimeout(() => router.push('/login'), 2000);
        } else {
          setError(`Kode salah. Percobaan ${attempts + 1}/5`);
        }
      } else {
        setError(apiError.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (!tempToken) {
    return null;
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
        Verifikasi 2 Langkah
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
        Masukkan kode dari Google Authenticator atau backup code
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Kode Verifikasi"
          value={code}
          onChange={(e) => setCode(e.target.value)}
          placeholder="123456 atau backup code"
          autoComplete="one-time-code"
        />

        <p className="text-xs text-slate-500">
          Gunakan 6 digit dari Google Authenticator atau salah satu backup code
        </p>

        <Button type="submit" fullWidth loading={loading} disabled={!code}>
          Verifikasi
        </Button>

        <div className="text-center">
          <button
            type="button"
            onClick={() => {
              localStorage.removeItem('2fa_temp');
              router.push('/login');
            }}
            className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline"
          >
            Batal dan login ulang
          </button>
        </div>
      </form>
    </div>
  );
}

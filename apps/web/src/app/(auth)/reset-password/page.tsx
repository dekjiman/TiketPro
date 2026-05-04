'use client';

import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { validatePassword, validateConfirmPassword, getPasswordStrength } from '@/lib/validation';

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token');

  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (!token) {
      setError('Token tidak valid');
    }
  }, [token]);

  const validation = useMemo(() => ({
    password: validatePassword(password),
    confirmPassword: validateConfirmPassword(password, confirmPassword),
  }), [password, confirmPassword]);

  const isValid = useMemo(() =>
    !validation.password && !validation.confirmPassword && password && confirmPassword && token
  , [validation, password, confirmPassword, token]);

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setLoading(true);
    setError('');

    try {
      await api.post('/api/auth/reset-password', { token, password });
      setSuccess(true);
    } catch (err) {
      const apiError = getApiError(err);
      if (apiError.code === 'INVALID_TOKEN') {
        setError('Token sudah expired. Silakan minta link reset ulang.');
      } else if (apiError.code === 'PASSWORD_REUSED') {
        setError('Password tidak boleh sama dengan yang sebelumnya');
      } else {
        setError(apiError.error);
      }
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Password Berhasil Dirubah
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
          Password Anda telah diperbarui. Silakan login dengan password baru.
        </p>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 text-sm mb-6">
          Semua sesi login telah di-logout untuk keamanan.
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-[#065F46] hover:underline">
          Login dengan password baru
        </Link>
      </div>
    );
  }

  if (!token) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Token Tidak Valid
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
          Link reset password tidak valid atau sudah expired.
        </p>
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm mb-6">
          Silakan minta link reset password ulang.
        </div>
        <Link href="/forgot-password" className="block text-center text-sm font-semibold text-[#065F46] hover:underline">
          Minta Link Reset Ulang
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
        Reset Password
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
        Masukkan password baru untuk akun Anda
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            Password Baru
          </label>
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={validation.password || undefined}
            placeholder="••••••••"
            autoComplete="new-password"
          />
          {password && (
            <div className="mt-2">
              <div className="flex gap-1">
                {[1, 2, 3, 4, 5, 6].map((i) => (
                  <div
                    key={i}
                    className={`h-1 flex-1 rounded transition-colors ${
                      i <= passwordStrength.score
                        ? passwordStrength.color === 'green'
                          ? 'bg-emerald-500'
                          : passwordStrength.color === 'yellow'
                          ? 'bg-yellow-500'
                          : 'bg-red-500'
                        : 'bg-slate-200 dark:bg-slate-700'
                    }`}
                  />
                ))}
              </div>
            </div>
          )}
        </div>

        <Input
          label="Konfirmasi Password"
          type="password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          error={validation.confirmPassword || undefined}
          placeholder="••••••••"
          autoComplete="new-password"
        />

        <Button type="submit" fullWidth loading={loading} disabled={!isValid}>
          Simpan Password
        </Button>
      </form>
    </div>
  );
}
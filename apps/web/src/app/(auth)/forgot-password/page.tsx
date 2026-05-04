'use client';

import { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { validateEmail } from '@/lib/validation';

export default function ForgotPasswordPage() {
  const router = useRouter();

  const [email, setEmail] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email) return;

    setLoading(true);
    setError('');

    try {
      await api.post('/api/auth/forgot-password', { email });
      // Always show success to prevent email enumeration
      setSuccess(true);
    } catch (err) {
      // Still show success even if error
      setSuccess(true);
    } finally {
      setLoading(false);
    }
  };

  if (success) {
    return (
      <div>
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Link Terkirim
        </h1>
        <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
          Jika email <strong>{email}</strong> terdaftar, kami telah mengirim link reset password.
        </p>
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 text-sm mb-6">
          Silakan check inbox atau folder spam Anda untuk link reset password. Link berlaku 1 jam.
        </div>
        <Link href="/login" className="block text-center text-sm font-semibold text-[#065F46] hover:underline">
          Kembali ke login
        </Link>
      </div>
    );
  }

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
        Lupa Password
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
        Masukkan email Anda untuk receiving link reset password
      </p>

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={!email ? undefined : validateEmail(email) || undefined}
          placeholder="email@example.com"
          autoComplete="email"
        />

        <Button type="submit" fullWidth loading={loading} disabled={!email}>
          Kirim Link Reset
        </Button>

        <p className="text-center text-sm text-slate-600 dark:text-slate-300">
          Ingat password?{' '}
          <Link href="/login" className="font-semibold text-[#065F46] hover:underline">
            Masuk
          </Link>
        </p>
      </form>
    </div>
  );
}
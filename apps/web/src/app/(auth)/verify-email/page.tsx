'use client';

import { useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export default function VerifyEmailPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const email = searchParams.get('email') || '';
  const redirect = searchParams.get('redirect') || '';
  const { setUser } = useAuthStore();

  const [otp, setOtp] = useState<string[]>(['', '', '', '', '', '']);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [cooldown, setCooldown] = useState(0);
  const [resendLoading, setResendLoading] = useState(false);
  const [devOtp, setDevOtp] = useState('');

  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
    const pendingOtp = localStorage.getItem('pending_otp') || '';
    if (pendingOtp) {
      setDevOtp(pendingOtp);
      setOtp(pendingOtp.split('').slice(0, 6));
    }
  }, []);

  useEffect(() => {
    if (cooldown > 0) {
      const timer = setTimeout(() => setCooldown(cooldown - 1), 1000);
      return () => clearTimeout(timer);
    }
  }, [cooldown]);

  const handleChange = (index: number, value: string) => {
    if (!/^\d*$/.test(value)) return;

    const newOtp = [...otp];
    newOtp[index] = value.slice(-1);
    setOtp(newOtp);

    if (value && index < 5) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Backspace' && !otp[index] && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
  };

  const handlePaste = (e: React.ClipboardEvent<HTMLInputElement>) => {
    e.preventDefault();
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, 6);
    const newOtp = [...otp];
    for (let i = 0; i < 6; i++) {
      newOtp[i] = pasted[i] || '';
    }
    setOtp(newOtp);
    const lastFilled = pasted.length - 1;
    if (lastFilled < 6) {
      inputRefs.current[Math.min(lastFilled, 5)]?.focus();
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const otpString = otp.join('');
    if (otpString.length !== 6) return;

    setLoading(true);
    setError('');

    try {
      const res = await api.post<{
        user: any;
        accessToken: string;
      }>('/api/auth/verify-email', {
        email,
        otp: otpString,
      });

      localStorage.setItem('user', JSON.stringify(res.data.user));
      localStorage.removeItem('pending_otp');
      setUser(res.data.user);

      const redirectPath =
        res.data.user.status === 'PENDING_APPROVAL'
          ? '/auth/pending-approval'
          : (redirect || (res.data.user.role === 'EO_ADMIN' ? '/eo' : '/dashboard'));
      router.push(redirectPath);
    } catch (err) {
      const apiError = getApiError(err);
      if (apiError.code === 'INVALID_OTP') {
        setError('Kode OTP salah atau sudah expired');
      } else {
        setError(apiError.error);
      }
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    if (cooldown > 0 || !email) return;

    setResendLoading(true);
    try {
      const res = await api.post<{ devOtp?: string }>('/api/auth/resend-otp', { email });
      if (res.data.devOtp) {
        localStorage.setItem('pending_otp', res.data.devOtp);
        setDevOtp(res.data.devOtp);
        setOtp(res.data.devOtp.split('').slice(0, 6));
      }
      setCooldown(60);
      setError('');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setResendLoading(false);
    }
  };

  const isComplete = otp.every((d) => d !== '');

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
        Verifikasi Email
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
        Kami telah mengirim kode verifikasi ke <br />
        <span className="font-semibold text-emerald-700 dark:text-emerald-400">{email}</span>
      </p>

      {devOtp && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg text-amber-700 dark:text-amber-300 text-sm">
          Mode lokal aktif. Kode verifikasi sementara: <span className="font-semibold tracking-[0.25em]">{devOtp}</span>
        </div>
      )}

      {error && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {error}
        </div>
      )}

      <form onSubmit={handleSubmit}>
        <div className="flex justify-center gap-2 mb-6">
          {otp.map((digit, index) => (
            <input
              key={index}
              ref={(el) => { inputRefs.current[index] = el; }}
              type="text"
              inputMode="numeric"
              maxLength={1}
              value={digit}
              onChange={(e) => handleChange(index, e.target.value)}
              onKeyDown={(e) => handleKeyDown(index, e)}
              onPaste={handlePaste}
              disabled={loading}
              className={`
                w-12 h-14 text-center text-xl font-bold rounded-lg border-2 transition-all
                focus:outline-none focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600
                bg-white dark:bg-slate-800
                ${error ? 'border-red-500 bg-red-50 dark:bg-red-900/20' : 'border-slate-300 dark:border-slate-600'}
                ${digit ? 'border-emerald-600 bg-emerald-50 dark:bg-emerald-900/20' : ''}
              `}
            />
          ))}
        </div>

        <Button type="submit" fullWidth loading={loading} disabled={!isComplete}>
          Verifikasi
        </Button>
      </form>

      <div className="mt-6 text-center">
        {cooldown > 0 ? (
          <p className="text-sm text-slate-500">
            Kirim ulang dalam {cooldown} detik
          </p>
        ) : (
          <button
            type="button"
            onClick={handleResend}
            disabled={resendLoading}
            className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline disabled:opacity-50"
          >
            {resendLoading ? 'Mengirim...' : 'Kirim ulang kode'}
          </button>
        )}
      </div>

      <p className="mt-8 text-center text-sm text-slate-600 dark:text-slate-300">
        <Link href="/login" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
          Kembali ke login
        </Link>
      </p>
    </div>
  );
}

'use client';

import { useState, useMemo, Suspense } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { getApiError } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { useAuthStore, type UserRole } from '@/store/authStore';
import { validateEmail, validatePassword, validateName, validatePhone, validateConfirmPassword, getPasswordStrength } from '@/lib/validation';

const ROLE_OPTIONS = [
  { value: 'CUSTOMER', label: 'Penonton' },
  { value: 'EO_ADMIN', label: 'Event Organizer' },
  { value: 'AFFILIATE', label: 'Affiliate' },
  { value: 'RESELLER', label: 'Reseller' },
];

function RegisterForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { register } = useAuthStore();

  const redirect = searchParams.get('redirect') || '/dashboard';
  const inviteToken = searchParams.get('invite');
  const eoId = searchParams.get('eoId');
  const inviteEmail = searchParams.get('email');
  const isInvite = !!inviteToken && !!eoId;

  const [name, setName] = useState('');
  const [email, setEmail] = useState(inviteEmail || '');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState<UserRole>(isInvite ? 'EO_STAFF' : 'CUSTOMER');
  
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');

  const validation = useMemo(() => ({
    name: validateName(name),
    email: validateEmail(email),
    phone: validatePhone(phone),
    password: validatePassword(password),
    confirmPassword: validateConfirmPassword(password, confirmPassword),
  }), [name, email, phone, password, confirmPassword]);

  const isValid = useMemo(() => 
    !validation.name && !validation.email && !validation.phone && 
    !validation.password && !validation.confirmPassword &&
    name && email && password && confirmPassword
  , [validation, name, email, phone, password, confirmPassword]);

  const passwordStrength = getPasswordStrength(password);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isValid || loading) return;

    setServerError('');
    setLoading(true);

    try {
      const registerData: any = { name, email, password, phone, role };
      if (isInvite) {
        registerData.inviteToken = inviteToken;
        registerData.eoId = eoId;
      }
      
      await register(registerData);
      const currentUser = useAuthStore.getState().user;
      if (currentUser) {
        router.push(redirect);
      } else {
        router.push(`/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`);
      }
    } catch (err: any) {
      if (err.message === 'EMAIL_VERIFICATION_REQUIRED') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`);
      } else if (err.message === 'REGISTER_INCOMPLETE') {
        router.push(`/verify-email?email=${encodeURIComponent(email)}&redirect=${encodeURIComponent(redirect)}`);
      } else {
        setServerError(getApiError(err).error);
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div>
      <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
        {isInvite ? 'Daftar Staff' : 'Daftar'}
      </h1>
      <p className="text-slate-600 dark:text-slate-400 mb-8" style={{ fontFamily: 'Inter' }}>
        {isInvite 
          ? 'Lengkapi data untuk bergabung dengan organisasi'
          : 'Buat akun untuk mulai menggunakan TiketPro'}
      </p>

      {serverError && (
        <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-5">
        <Input
          label="Nama Lengkap"
          value={name}
          onChange={(e) => setName(e.target.value)}
          error={validation.name || undefined}
          placeholder="John Doe"
          autoComplete="name"
        />

        <Input
          label="Email"
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          error={validation.email || undefined}
          placeholder="email@example.com"
          autoComplete="email"
          disabled={!!inviteEmail}
        />

        <Input
          label="Nomor HP"
          type="tel"
          value={phone}
          onChange={(e) => setPhone(e.target.value)}
          error={validation.phone || undefined}
          placeholder="08123456789"
          autoComplete="tel"
        />

        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            Password
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
              <p className={`mt-1 text-xs ${
                passwordStrength.color === 'green'
                  ? 'text-emerald-600'
                  : passwordStrength.color === 'yellow'
                  ? 'text-yellow-600'
                  : 'text-red-600'
              }`}>
                Password: {passwordStrength.label}
              </p>
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

        {!isInvite && (
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Daftar Sebagai
            </label>
            <select
              value={role}
              onChange={(e) => setRole(e.target.value as UserRole)}
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 outline-none transition"
            >
              {ROLE_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <Button
          type="submit"
          fullWidth
          loading={loading}
          disabled={!isValid}
        >
          {isInvite ? 'Daftar Sekarang' : 'Daftar'}
        </Button>

        <p className="text-center text-sm text-slate-600 dark:text-slate-300">
          Sudah punya akun?{' '}
          <Link href="/login" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
            Masuk
          </Link>
        </p>
      </form>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={
      <div className="flex items-center justify-center py-8">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    }>
      <RegisterForm />
    </Suspense>
  );
}

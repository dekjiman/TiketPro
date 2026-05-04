'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button, Input } from '@/components/ui';
import { authApi } from '@/lib/api';
import type { User } from '@/store/authStore';
import { validateEmail, validatePassword, validateName, validatePhone, validateConfirmPassword, getPasswordStrength } from '@/lib/validation';

interface RegisterFormProps {
  onSuccess?: (user: User) => void;
  defaultRole?: 'CUSTOMER' | 'EO_ADMIN' | 'AFFILIATE' | 'RESELLER';
}

export function RegisterForm({ onSuccess, defaultRole = 'CUSTOMER' }: RegisterFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [role, setRole] = useState(defaultRole);
  const [referralCode, setReferralCode] = useState('');
  const [agreeTerms, setAgreeTerms] = useState(false);
  
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(false);
  const [serverError, setServerError] = useState('');
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const ref = searchParams.get('ref');
    if (ref) setReferralCode(ref);
  }, [searchParams]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setServerError('');

    const newErrors: Record<string, string> = {};
    if (validateName(name)) newErrors.name = validateName(name)!;
    if (validateEmail(email)) newErrors.email = validateEmail(email)!;
    if (validatePhone(phone)) newErrors.phone = validatePhone(phone)!;
    if (validatePassword(password)) newErrors.password = validatePassword(password)!;
    if (validateConfirmPassword(password, confirmPassword)) newErrors.confirmPassword = validateConfirmPassword(password, confirmPassword)!;
    if (!agreeTerms) newErrors.terms = 'Anda harus menyetujui syarat & ketentuan';

    if (Object.keys(newErrors).length > 0) {
      setErrors(newErrors);
      return;
    }

    setErrors({});
    setLoading(true);

    try {
      const res = await authApi.register({ name, email, password, phone, role });

      if (res.data.requiresVerification) {
        router.push(`/verify-email?email=${encodeURIComponent(email)}`);
      } else {
        localStorage.setItem('user', JSON.stringify(res.data.user));
        onSuccess?.(res.data.user);
        router.push('/dashboard');
      }
    } catch (err: any) {
      setServerError(err.message || 'Terjadi kesalahan saat daftar');
    } finally {
      setLoading(false);
    }
  };

  const strength = getPasswordStrength(password);

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {serverError && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg text-red-600 dark:text-red-400 text-sm">
          {serverError}
        </div>
      )}

      {success && (
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 rounded-lg text-emerald-600 dark:text-emerald-400 text-sm">
          Akun berhasil dibuat! Mengarahkan ke halaman verifikasi...
        </div>
      )}

      <Input
        label="Nama Lengkap"
        value={name}
        onChange={(e) => setName(e.target.value)}
        error={errors.name}
        placeholder="John Doe"
        autoComplete="name"
      />

      <Input
        label="Email"
        type="email"
        value={email}
        onChange={(e) => setEmail(e.target.value)}
        error={errors.email}
        placeholder="email@example.com"
        autoComplete="email"
      />

      <Input
        label="Nomor HP"
        type="tel"
        value={phone}
        onChange={(e) => setPhone(e.target.value)}
        error={errors.phone}
        placeholder="08123456789"
        autoComplete="tel"
      />

      <div>
        <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Password</label>
        <Input
          type="password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          error={errors.password}
          placeholder="••••••••"
          autoComplete="new-password"
        />
        {password && (
          <div className="mt-2">
            <div className="flex gap-1 mb-1">
              {[1, 2, 3, 4, 5, 6].map((i) => (
                <div
                  key={i}
                  className={`h-1 flex-1 rounded ${
                    i <= strength.score
                      ? strength.color === 'green'
                        ? 'bg-emerald-500'
                        : strength.color === 'yellow'
                        ? 'bg-yellow-500'
                        : 'bg-red-500'
                      : 'bg-slate-200 dark:bg-slate-700'
                  }`}
                />
              ))}
            </div>
            <p className={`text-xs ${
              strength.color === 'green' ? 'text-emerald-600' : strength.color === 'yellow' ? 'text-yellow-600' : 'text-red-600'
            }`}>
              Password: {strength.label}
            </p>
          </div>
        )}
      </div>

      <Input
        label="Konfirmasi Password"
        type="password"
        value={confirmPassword}
        onChange={(e) => setConfirmPassword(e.target.value)}
        error={errors.confirmPassword}
        placeholder="••••••••"
        autoComplete="new-password"
      />

      {defaultRole !== 'CUSTOMER' && (
        <div>
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
            {role === 'EO_ADMIN' ? 'Nama Perusahaan/EO' : 'Nama Akun'}
          </label>
          <Input placeholder={role === 'EO_ADMIN' ? 'PT Maju Jaya' : '@username'} />
        </div>
      )}

      <Input
        label="Referral Code (Opsional)"
        value={referralCode}
        onChange={(e) => setReferralCode(e.target.value)}
        placeholder="XXXXXX"
      />

      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={agreeTerms}
          onChange={(e) => setAgreeTerms(e.target.checked)}
          className="mt-1 w-4 h-4 rounded border-slate-300 text-emerald-700 dark:text-emerald-400 focus:ring-emerald-600"
        />
        <label className="text-sm text-slate-600 dark:text-slate-300">
          Saya setuju dengan{' '}
          <Link href="/terms" className="text-emerald-700 dark:text-emerald-400 hover:underline">Syarat & Ketentuan</Link>
          {' '}dan{' '}
          <Link href="/privacy" className="text-emerald-700 dark:text-emerald-400 hover:underline">Kebijakan Privasi</Link>
        </label>
      </div>
      {errors.terms && <p className="text-sm text-red-500">{errors.terms}</p>}

      <Button type="submit" fullWidth loading={loading}>
        Daftar
      </Button>

      <p className="text-center text-sm text-slate-600 dark:text-slate-300">
        Sudah punya akun?{' '}
        <Link href="/login" className="font-semibold text-emerald-700 dark:text-emerald-400 hover:underline">
          Masuk
        </Link>
      </p>
    </form>
  );
}

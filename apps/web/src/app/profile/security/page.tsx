'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

interface TwoFASetup {
  secret: string;
  qrCodeUrl: string;
}

export default function SecurityPage() {
  const { user, setUser } = useAuthStore();
  const toast = useToast();

  const [step, setStep] = useState<'list' | 'setup' | 'activate'>('list');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Setup state
  const [setupData, setSetupData] = useState<TwoFASetup | null>(null);
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [showBackup, setShowBackup] = useState(false);

  // Disable state
  const [disablePassword, setDisablePassword] = useState('');

  const twoFAEnabled = user?.twoFAEnabled;

  const handleSetup = async () => {
    if (loading) return;
    setLoading(true);
    setError('');
    try {
      const res = await api.post<TwoFASetup>('/api/auth/2fa/setup');
      setSetupData(res);
      setStep('activate');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  const handleActivate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!code || !password || loading) return;

    setLoading(true);
    setError('');
    try {
      const res = await api.post<{ message: string; backupCodes: string[] }>('/api/auth/2fa/activate', {
        code,
        password,
      });
      setBackupCodes(res.backupCodes);
      if (user) setUser({ ...user, twoFAEnabled: true });
      toast.showToast('success', '2FA berhasil diaktifkan');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!disablePassword || loading) return;

    setLoading(true);
    setError('');
    try {
      await api.delete('/api/auth/2fa', { password: disablePassword });
      if (user) setUser({ ...user, twoFAEnabled: false });
      setStep('list');
      toast.showToast('success', '2FA dinonaktifkan');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  if (step === 'activate' && backupCodes.length > 0) {
    return (
      <div className="max-w-md mx-auto py-8">
        <h1 className="text-2xl font-bold mb-4" style={{ fontFamily: 'Manrope' }}>
          2FA Aktif
        </h1>
        <p className="text-slate-600 mb-6">Simpan backup codes ini di tempat aman:</p>
        
        <div className="bg-slate-100 dark:bg-slate-800 p-4 rounded-lg font-mono text-sm space-y-2">
          {backupCodes.map((code, i) => (
            <div key={i} className="flex justify-between">
              <span>{code.slice(0, 4)}</span>
              <span>{code.slice(4)}</span>
            </div>
          ))}
        </div>
        
        <p className="text-xs text-red-500 mt-4">
          Warning: Backup code hanya dapat digunakan sekali.
        </p>
        
        <Button onClick={() => { setStep('list'); setBackupCodes([]); }} fullWidth className="mt-6">
          Selesai
        </Button>
      </div>
    );
  }

  if (step === 'activate' && setupData) {
    return (
      <div className="max-w-md mx-auto py-8">
        <Link href="/profile/security" onClick={() => setStep('list')} className="text-sm text-slate-500 hover:text-[#065F46]">
          ← Kembali
        </Link>
        <h1 className="text-2xl font-bold mt-2 mb-4" style={{ fontFamily: 'Manrope' }}>
          Aktifkan 2FA
        </h1>
        
        <div className="mb-6 p-4 bg-white dark:bg-slate-800 rounded-lg border text-center">
          <p className="text-sm text-slate-500 mb-2">Scan dengan Google Authenticator</p>
          <img src={setupData.qrCodeUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
          <p className="text-xs text-slate-400 mt-2 font-mono">{setupData.secret}</p>
        </div>
        
        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
            {error}
          </div>
        )}
        
        <form onSubmit={handleActivate} className="space-y-4">
          <Input
            label="Kode dari App"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            placeholder="123456"
          />
          <Input
            label="Password"
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            placeholder="••••••••"
          />
          <Button type="submit" fullWidth loading={loading} disabled={!code || !password}>
            Aktifkan
          </Button>
        </form>
      </div>
    );
  }

  return (
    <div className="max-w-md mx-auto py-8">
      <div className="flex items-center justify-between mb-6">
        <div>
          <Link href="/profile" className="text-sm text-slate-500 hover:text-[#065F46]">
            ← Kembali ke Profil
          </Link>
          <h1 className="text-2xl font-bold mt-2" style={{ fontFamily: 'Manrope' }}>
            Keamanan
          </h1>
        </div>
      </div>

      {error && (
        <div className="mb-6 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6 mb-6">
        <h2 className="text-lg font-semibold mb-2">Two-Factor Authentication (2FA)</h2>
        <p className="text-sm text-slate-500 mb-4">
          Lindungi akun dengan kode verifikasi dari Google Authenticator.
        </p>
        
        {twoFAEnabled ? (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-emerald-600">
              <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 20 20">
                <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
              </svg>
              <span className="font-medium">2FA Aktif</span>
            </div>
            
            <form onSubmit={handleDisable} className="space-y-4 border-t pt-4">
              <p className="text-sm">Masukkan password untuk nonaktifkan 2FA:</p>
              <Input
                type="password"
                value={disablePassword}
                onChange={(e) => setDisablePassword(e.target.value)}
                placeholder="Password"
              />
              <Button type="submit" variant="danger" loading={loading} disabled={!disablePassword}>
                Nonaktifkan 2FA
              </Button>
            </form>
          </div>
        ) : (
          <Button onClick={handleSetup} loading={loading}>
            Aktifkan 2FA
          </Button>
        )}
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-2">Backup Codes</h2>
        <p className="text-sm text-slate-500 mb-4">
          Gunakan jika kehilangan akses ke Google Authenticator.
        </p>
        
        {twoFAEnabled && (
          <Button variant="outline" onClick={() => setShowBackup(!showBackup)}>
            {showBackup ? 'Sembunyikan' : 'Tampilkan Backup Codes'}
          </Button>
        )}
        
        {!twoFAEnabled && (
          <p className="text-sm text-slate-400">Aktifkan 2FA terlebih dahulu</p>
        )}
        
        {showBackup && twoFAEnabled && backupCodes.length === 0 && (
          <p className="text-sm text-slate-400">
            Hubungi support untuk mendapatkan backup codes baru.
          </p>
        )}
      </section>
    </div>
  );
}
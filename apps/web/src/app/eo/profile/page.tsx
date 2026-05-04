'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Image from 'next/image';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

interface EOProfile {
  id: string;
  companyName: string;
  bankName?: string;
  bankAccount?: string;
  commission: number;
  user: {
    id: string;
    name: string;
    email: string;
    phone?: string;
    avatar?: string;
  };
}

export default function EOProfilePage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  const [profile, setProfile] = useState<EOProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [companyName, setCompanyName] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankAccount, setBankAccount] = useState('');

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  const loadProfile = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/eo/profile');
      const data = response.data?.data || response.data;
      setProfile(data);
      setCompanyName(data?.companyName || '');
      setBankName(data?.bankName || '');
      setBankAccount(data?.bankAccount || '');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'EO_ADMIN' || user?.role === 'EO_STAFF') {
      loadProfile();
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;
    setSaving(true);
    setError('');
    try {
      await api.put('/api/eo/profile', {
        companyName,
        bankName,
        bankAccount,
      });
      toast.showToast('success', 'Profil berhasil disimpan');
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  if (!user || (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="max-w-2xl space-y-6">
      <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>
        Profil EO
      </h1>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 space-y-6">
          <div className="flex items-center gap-4 pb-6 border-b border-slate-200 dark:border-slate-700">
            <div className="w-16 h-16 rounded-full bg-slate-100 dark:bg-slate-700 overflow-hidden flex items-center justify-center">
              {profile?.user?.avatar ? (
                <Image src={profile.user.avatar} alt={profile?.user?.name || ''} width={64} height={64} className="object-cover" />
              ) : (
                <span className="text-2xl font-bold text-slate-400">
                  {profile?.user?.name?.charAt(0).toUpperCase() || 'U'}
                </span>
              )}
            </div>
            <div>
              <h2 className="text-xl font-semibold">{profile?.user?.name}</h2>
              <p className="text-sm text-slate-500">{profile?.user?.email}</p>
              {profile?.user?.phone && (
                <p className="text-sm text-slate-500">{profile.user.phone}</p>
              )}
            </div>
          </div>

          <form onSubmit={handleSave} className="space-y-4">
            <Input
              label="Nama Perusahaan"
              value={companyName}
              onChange={(e) => setCompanyName(e.target.value)}
              placeholder="PT Contoh Concert"
            />

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <h3 className="font-medium mb-4">Informasi Bank</h3>
              <div className="grid md:grid-cols-2 gap-4">
                <Input
                  label="Nama Bank"
                  value={bankName}
                  onChange={(e) => setBankName(e.target.value)}
                  placeholder="Bank Central Asia"
                />
                <Input
                  label="Nomor Rekening"
                  value={bankAccount}
                  onChange={(e) => setBankAccount(e.target.value)}
                  placeholder="1234567890"
                />
              </div>
            </div>

            <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
              <div className="flex items-center justify-between text-sm text-slate-500">
                <span>Platform Fee</span>
                <span>{Math.round((profile?.commission || 0.05) * 100)}%</span>
              </div>
              <p className="text-xs text-slate-400 mt-1">Fee platform tidak dapat diubah</p>
            </div>

            {user?.role === 'EO_ADMIN' && (
              <Button type="submit" loading={saving} fullWidth>
                Simpan Perubahan
              </Button>
            )}
          </form>
        </div>
      )}
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export default function ProfilePage() {
  const { user, setUser } = useAuthStore();
  const toast = useToast();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');
  const [avatarPreview, setAvatarPreview] = useState('');

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCity(user.city || '');
      setAvatarPreview(user.avatar || '');
    }
  }, [user]);

  const handleSaveInfo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || !name) return;

    setSaving(true);
    try {
      await api.patch('/api/users/me', { name, phone, city });
      if (user) setUser({ ...user, name, phone, city });
      toast.showToast('success', 'Profil berhasil diperbarui');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving || newPassword !== confirmPassword) {
      setPasswordError('Password tidak cocok');
      return;
    }

    setSaving(true);
    setPasswordError('');
    try {
      await api.post('/api/users/me/change-password', { currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      toast.showToast('success', 'Password berhasil diubah');
    } catch (err) {
      setPasswordError(getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope' }}>
          Pengaturan Profil
        </h1>
        <Link href="/profile/sessions" className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline">
          Kelola Sesi
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Informasi Dasar</h2>
        <form onSubmit={handleSaveInfo} className="space-y-4">
          <Input
            label="Nama Lengkap"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="John Doe"
          />
          <Input
            label="Nomor HP"
            type="tel"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="08123456789"
          />
          <Input
            label="Kota"
            value={city}
            onChange={(e) => setCity(e.target.value)}
            placeholder="Jakarta"
          />
          <Button type="submit" loading={saving} disabled={saving || !name}>
            Simpan
          </Button>
        </form>
      </section>

      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Ubah Password</h2>
        <form onSubmit={handleChangePassword} className="space-y-4">
          <Input
            label="Password Lama"
            type="password"
            value={currentPassword}
            onChange={(e) => setCurrentPassword(e.target.value)}
            placeholder="••••••••"
            disabled={saving}
          />
          <Input
            label="Password Baru"
            type="password"
            value={newPassword}
            onChange={(e) => setNewPassword(e.target.value)}
            placeholder="••••••••"
            disabled={saving}
          />
          <Input
            label="Konfirmasi Password Baru"
            type="password"
            value={confirmPassword}
            onChange={(e) => setConfirmPassword(e.target.value)}
            error={passwordError || undefined}
            placeholder="••••••••"
            disabled={saving}
          />
          <Button type="submit" loading={saving} disabled={saving} variant="outline">
            Ubah Password
          </Button>
        </form>
      </section>
    </div>
  );
}

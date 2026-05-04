'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

export default function DashboardProfilePage() {
  const { user, setUser } = useAuthStore();
  const toast = useToast();

  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState('');

  useEffect(() => {
    if (user) {
      setName(user.name || '');
      setPhone(user.phone || '');
      setCity(user.city || '');
    }
  }, [user]);

  const handleSave = async (e: React.FormEvent) => {
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

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">Profil</h1>
        <Link href="/profile" className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline">
          Lihat Profil Lengkap
        </Link>
      </div>

      {error && (
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
        </div>
      )}

      <section className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4 text-slate-900 dark:text-white">Informasi Dasar</h2>
        <form onSubmit={handleSave} className="space-y-4">
          <Input
            label="Nama"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <Input
            label="No HP"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
          <Input
            label="Kota"
            value={city}
            onChange={(e) => setCity(e.target.value)}
          />
          <Button type="submit" loading={saving}>
            Simpan
          </Button>
        </form>
      </section>
    </div>
  );
}

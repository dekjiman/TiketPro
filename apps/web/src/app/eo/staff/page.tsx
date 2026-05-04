'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/utils';

interface Invite {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  isExpired: boolean;
}

export default function EoStaffPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  const [invites, setInvites] = useState<Invite[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteMessage, setInviteMessage] = useState('');
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN') {
      toast.showToast('error', 'Access denied. EO Admin only.');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  const loadInvites = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: Invite[] }>('/api/eo/invites');
      setInvites(response.data?.data || []);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'EO_ADMIN') {
      loadInvites();
    }
  }, [user]);

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inviteEmail || sending) return;

    setSending(true);
    setError('');
    try {
      await api.post('/api/eo/invite-staff', {
        email: inviteEmail,
        message: inviteMessage || undefined,
      });
      toast.showToast('success', 'Undangan berhasil dikirim');
      setInviteEmail('');
      setInviteMessage('');
      loadInvites();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSending(false);
    }
  };

  const handleRevoke = async (id: string) => {
    if (!confirm('Batalkan undangan ini?')) return;
    try {
      await api.delete(`/api/eo/invites/${id}`);
      toast.showToast('success', 'Undangan dibatalkan');
      loadInvites();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  if (!user || user.role !== 'EO_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Checking permissions...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>
          Kelola Staff
        </h1>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Undang Staff Baru</h2>
        <form onSubmit={handleInvite} className="space-y-4">
          <Input
            label="Email Staff"
            type="email"
            value={inviteEmail}
            onChange={(e) => setInviteEmail(e.target.value)}
            placeholder="staff@email.com"
            required
          />
          <div>
            <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">
              Pesan (opsional)
            </label>
            <textarea
              value={inviteMessage}
              onChange={(e) => setInviteMessage(e.target.value)}
              placeholder="Pesan tambahan untuk staff..."
              className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-[#065F46]/50 focus:border-[#065F46] outline-none transition resize-none"
              rows={3}
            />
          </div>
          <Button type="submit" loading={sending} disabled={!inviteEmail || sending}>
            Kirim Undangan
          </Button>
        </form>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Daftar Undangan</h2>
        
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="w-6 h-6 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
          </div>
        ) : error ? (
          <div className="text-center py-8">
            <p className="text-red-500 mb-4">{error}</p>
            <Button variant="outline" onClick={loadInvites}>Coba Lagi</Button>
          </div>
        ) : invites.length === 0 ? (
          <p className="text-slate-500 text-center py-8">Belum ada undangan</p>
        ) : (
          <div className="space-y-3">
            {invites.map((invite) => (
              <div key={invite.id} className="flex items-center justify-between p-4 border border-slate-200 dark:border-slate-700 rounded-lg">
                <div>
                  <p className="font-medium">{invite.email}</p>
                  <p className="text-sm text-slate-500">
                    Dikirim {formatDate(invite.createdAt)}
                    {invite.isExpired && ' • Kadaluarsa'}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`px-2 py-1 text-xs font-medium rounded-full ${
                    invite.status === 'PENDING' && !invite.isExpired
                      ? 'bg-blue-100 text-blue-700'
                      : invite.status === 'ACCEPTED'
                      ? 'bg-emerald-100 text-emerald-700'
                      : 'bg-slate-100 text-slate-600'
                  }`}>
                    {invite.status === 'PENDING' && !invite.isExpired ? 'Menunggu' : invite.status}
                  </span>
                  {invite.status === 'PENDING' && !invite.isExpired && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleRevoke(invite.id)}
                    >
                      Batalkan
                    </Button>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
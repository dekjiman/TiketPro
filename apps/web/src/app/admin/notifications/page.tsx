'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { Bell, CheckCheck, ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';

interface NotificationItem {
  id: string;
  type: string;
  title: string;
  body: string;
  data?: { eventId?: string };
  isRead: boolean;
  createdAt: string;
}

export default function AdminNotificationsPage() {
  const toast = useToast();
  const [items, setItems] = useState<NotificationItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [meta, setMeta] = useState({ totalPages: 1, unread: 0 });
  const limit = 15;

  const load = async (targetPage = page) => {
    setLoading(true);
    try {
      const res = await api.get(`/api/notifications?page=${targetPage}&limit=${limit}`);
      setItems(res.data?.data || []);
      setMeta({
        totalPages: res.data?.meta?.totalPages || 1,
        unread: res.data?.meta?.unread || 0,
      });
      setPage(targetPage);
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load(1);
  }, []);

  const markRead = async (id: string) => {
    try {
      await api.post(`/api/notifications/${id}/read`);
      await load(page);
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const markAllRead = async () => {
    try {
      await api.post('/api/notifications/read-all');
      await load(page);
      toast.showToast('success', 'Semua notifikasi ditandai dibaca');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  return (
    <div className="max-w-5xl mx-auto py-10 px-4">
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 flex items-center gap-2">
            <Bell className="w-6 h-6 text-emerald-600" /> Notifikasi
          </h1>
          <p className="text-sm text-slate-500 mt-1">Riwayat notifikasi moderasi event.</p>
        </div>
        <Button variant="outline" onClick={markAllRead}>
          <CheckCheck className="w-4 h-4 mr-2" /> Tandai Semua Dibaca
        </Button>
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white overflow-hidden">
        {loading ? (
          <div className="p-10 text-center text-slate-500">Memuat notifikasi...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-slate-500">Belum ada notifikasi.</div>
        ) : (
          <div>
            {items.map((n) => (
              <div key={n.id} className={`px-5 py-4 border-b border-slate-100 ${n.isRead ? 'bg-white' : 'bg-emerald-50/40'}`}>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm font-semibold text-slate-900">{n.title}</p>
                    <p className="text-sm text-slate-600 mt-1">{n.body}</p>
                    <p className="text-xs text-slate-500 mt-2">{new Date(n.createdAt).toLocaleString('id-ID')}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {n.data?.eventId && (
                      <Link
                        href={`/admin/events?eventId=${encodeURIComponent(n.data.eventId)}&openDiscussion=1&notifId=${encodeURIComponent(n.id)}`}
                        className="inline-flex items-center text-xs text-blue-600 hover:underline"
                      >
                        Buka Event <ExternalLink className="w-3.5 h-3.5 ml-1" />
                      </Link>
                    )}
                    {!n.isRead && (
                      <button className="text-xs text-emerald-700 hover:underline" onClick={() => markRead(n.id)}>
                        Tandai dibaca
                      </button>
                    )}
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="mt-4 flex items-center justify-between">
        <p className="text-sm text-slate-500">Halaman {page} dari {meta.totalPages}</p>
        <div className="flex items-center gap-2">
          <Button variant="outline" disabled={page <= 1} onClick={() => load(page - 1)}>
            <ChevronLeft className="w-4 h-4 mr-1" /> Prev
          </Button>
          <Button variant="outline" disabled={page >= meta.totalPages} onClick={() => load(page + 1)}>
            Next <ChevronRight className="w-4 h-4 ml-1" />
          </Button>
        </div>
      </div>
    </div>
  );
}

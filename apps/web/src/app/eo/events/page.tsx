'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/utils';
import { Plus, Edit, Trash2 } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  status: string;
  startDate: string;
  endDate: string;
  city: string;
  province?: string;
  isMultiDay: boolean;
  createdAt: string;
  eoId?: string;
}

interface Meta {
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

const STATUS_COLORS: Record<string, string> = {
  DRAFT: 'bg-gray-100 text-gray-600',
  REVIEW: 'bg-amber-100 text-amber-700',
  PUBLISHED: 'bg-emerald-100 text-emerald-700',
  SALE_OPEN: 'bg-blue-100 text-blue-700',
  SALE_CLOSED: 'bg-purple-100 text-purple-700',
  COMPLETED: 'bg-slate-100 text-slate-600',
  CANCELLED: 'bg-red-100 text-red-700',
  ARCHIVED: 'bg-slate-100 text-slate-500',
};

const STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  REVIEW: 'Menunggu Review',
  PUBLISHED: 'Published',
  SALE_OPEN: 'Sale Buka',
  SALE_CLOSED: 'Sale Tutup',
  COMPLETED: 'Selesai',
  CANCELLED: 'Dibatalkan',
  ARCHIVED: 'Diarsipkan',
};

export default function EOEventsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  const [events, setEvents] = useState<Event[]>([]);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [deleteId, setDeleteId] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  const loadEvents = async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (status) params.set('status', status);
      params.set('page', String(page));
      params.set('limit', '20');

      const response = await api.get(`/api/eo/events?${params}`);
      const resData = response.data as any;
      let eventsData: any[] = [];
      let metaData: any = { total: 0, page: 1, limit: 20, totalPages: 0 };

      if (Array.isArray(resData)) {
        eventsData = resData;
      } else if (resData) {
        eventsData = resData.data || resData.events || [];
        metaData = resData.meta || resData;
      }

      setEvents(eventsData);
      setMeta(metaData);
    } catch (err) {
      setError(getApiError(err).error);
      setEvents([]);
      setMeta({ total: 0, page: 1, limit: 20, totalPages: 0 });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'EO_ADMIN') {
      loadEvents();
    }
  }, [user, search, status, page]);

  if (!user || user.role !== 'EO_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const handleDelete = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menghapus event ini?')) return;
    try {
      await api.delete(`/api/events/${id}`);
      toast.showToast('success', 'Event deleted successfully');
      loadEvents();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setDeleteId(null);
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>Event Saya</h1>
        <Link href="/eo/events/create">
          <Button>
            <Plus className="w-4 h-4 mr-2" />
            Buat Event
          </Button>
        </Link>
      </div>

      {/* Filters */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
        <div className="flex flex-col md:flex-row gap-4">
          <Input
            placeholder="Cari event..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            className="w-full"
          />
          <select
            value={status}
            onChange={(e) => { setStatus(e.target.value); setPage(1); }}
            className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700"
          >
            <option value="">Semua Status</option>
            <option value="DRAFT">Draft</option>
            <option value="REVIEW">Review</option>
            <option value="PUBLISHED">Published</option>
            <option value="SALE_OPEN">Sale Buka</option>
            <option value="SALE_CLOSED">Sale Tutup</option>
            <option value="COMPLETED">Selesai</option>
          </select>
        </div>
      </div>

      {/* Messages */}
      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
        </div>
      )}

      {/* Loading */}
      {loading ? (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : events.length === 0 ? (
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-8 text-center">
          <div className="w-12 h-12 text-slate-300 mx-auto mb-3">📅</div>
          <p className="text-slate-500 mb-4">Belum ada event</p>
          <Link href="/eo/events/create">
            <Button>Buat Event Pertama</Button>
          </Link>
        </div>
      ) : (
        // Events List
        <div className="space-y-3">
          {events.map((event) => (
            <div
              key={event.id}
              className="group bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 hover:border-emerald-600 dark:hover:border-emerald-500 hover:shadow-md transition-all duration-200"
            >
              <div className="flex items-start gap-4">
                {/* Thumbnail */}
                <div className="w-16 h-16 rounded-lg bg-slate-100 dark:bg-slate-700 flex-shrink-0 overflow-hidden flex items-center justify-center">
                  {event.posterUrl ? (
                    <Image src={event.posterUrl} alt={event.title} width={64} height={64} className="object-cover w-full h-full" />
                  ) : (
                    <span className="text-slate-400">📁</span>
                  )}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between mb-1">
                    <h3 className="font-semibold truncate">{event.title}</h3>
                    <span className={`px-2.5 py-0.5 text-xs font-medium rounded-full ${STATUS_COLORS[event.status] || ''}`}>
                      {STATUS_LABELS[event.status] || event.status}
                    </span>
                  </div>
                  <p className="text-sm text-slate-500">
                    {formatDate(event.startDate)} • {event.city}
                  </p>
                </div>

                {/* Actions */}
                <div className="flex-shrink-0 flex gap-2 opacity-100 md:opacity-0 md:group-hover:opacity-100 transition-opacity">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => router.push(`/eo/events/${event.id}/manage`)}
                  >
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-red-600 hover:text-red-800 hover:bg-red-50"
                    onClick={() => setDeleteId(event.id)}
                  >
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Pagination */}
      {meta && meta.totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-8">
          <Button
            variant="ghost"
            size="sm"
            disabled={page <= 1}
            onClick={() => setPage(page - 1)}
          >
            ← Prev
          </Button>
          <span className="px-4 py-2 text-sm text-slate-500">
            Page {page} of {meta.totalPages}
          </span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page >= meta.totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next →
          </Button>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteId && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-slate-800 p-6 rounded-xl max-w-sm w-full mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-2">Konfirmasi Hapus</h3>
            <p className="text-slate-600 dark:text-slate-300 text-sm mb-4">
              Apakah Anda yakin ingin menghapus event ini? Tindakan ini tidak dapat dibatalkan.
            </p>
            <div className="flex justify-end gap-3">
              <Button
                variant="ghost"
                onClick={() => setDeleteId(null)}
              >
                Batal
              </Button>
              <Button
                variant="danger"
                onClick={async () => {
                  try {
                    await api.delete(`/api/events/${deleteId}`);
                    toast.showToast('success', 'Event deleted successfully');
                    loadEvents();
                  } catch (err) {
                    toast.showToast('error', getApiError(err).error);
                  }
                  setDeleteId(null);
                }}
              >
                Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

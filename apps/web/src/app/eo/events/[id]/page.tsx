'use client';

import { useState, useEffect } from 'react';
import { useRouter, useParams } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/utils';
import { Calendar, Users, Ticket, DollarSign, Edit, Eye, TrendingUp } from 'lucide-react';

interface Event {
  id: string;
  title: string;
  slug: string;
  posterUrl?: string;
  bannerUrl?: string;
  status: string;
  startDate: string;
  endDate: string;
  city: string;
  province?: string;
  isMultiDay: boolean;
  shortDescription?: string;
  description?: string;
}

interface Summary {
  totalSold: number;
  totalQuota: number;
  quotaFillPercent: number;
  totalRevenue: number;
  netRevenue: number;
  platformFeePercent: number;
  categorySummary: {
    categoryId: string;
    name: string;
    quota: number;
    sold: number;
    available: number;
    revenue: number;
  }[];
}

export default function EOEventDetailPage() {
  const router = useRouter();
  const params = useParams();
  const { user } = useAuthStore();
  const toast = useToast();
  const id = params.id as string;

  const [event, setEvent] = useState<Event | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  const loadData = async () => {
    setLoading(true);
    setError('');
    try {
      const [eventRes, summaryRes] = await Promise.all([
        api.get(`/api/events/${id}`),
        api.get(`/api/eo/events/${id}/dashboard/summary`),
      ]);
      setEvent(eventRes.data?.data || eventRes.data);
      setSummary(summaryRes.data?.data || summaryRes.data);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id && id !== 'create' && (user?.role === 'EO_ADMIN' || user?.role === 'EO_STAFF')) {
      loadData();
    }
  }, [id, user]);

  if (!user || (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
        {error}
        <Button size="sm" variant="outline" onClick={loadData} className="mt-2">Coba Lagi</Button>
      </div>
    );
  }

  if (!event) {
    return (
      <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg text-amber-600">
        Event tidak ditemukan
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>
          {event.title}
        </h1>
        <div className="flex gap-2">
          <Link href={`/events/${event.slug}`} target="_blank">
            <Button variant="outline">
              <Eye className="w-4 h-4 mr-2" />
              Lihat Publik
            </Button>
          </Link>
          <Link href={`/eo/events/${id}/edit`}>
            <Button>
              <Edit className="w-4 h-4 mr-2" />
              Edit Event
            </Button>
          </Link>
        </div>
      </div>

      {event.bannerUrl && (
        <div className="relative h-48 rounded-xl overflow-hidden">
          <Image src={event.bannerUrl} alt={event.title} fill className="object-cover" />
        </div>
      )}

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Ticket className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{summary?.totalSold || 0}</p>
          <p className="text-xs text-slate-500">Tiket Terjual</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">Rp {(summary?.totalRevenue || 0).toLocaleString('id-ID')}</p>
          <p className="text-xs text-slate-500">Gross Revenue</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
            <TrendingUp className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{summary?.quotaFillPercent || 0}%</p>
          <p className="text-xs text-slate-500">Kuota Terisi</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{summary?.totalQuota || 0}</p>
          <p className="text-xs text-slate-500">Total Kuota</p>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Per Kategori Tiket</h2>
        {summary?.categorySummary?.length ? (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-slate-200 dark:border-slate-700">
                  <th className="text-left py-2 px-3 font-medium text-slate-500">Kategori</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-500">Terjual</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-500">Tersedia</th>
                  <th className="text-right py-2 px-3 font-medium text-slate-500">Revenue</th>
                </tr>
              </thead>
              <tbody>
                {summary.categorySummary.map((cat) => (
                  <tr key={cat.categoryId} className="border-b border-slate-100 dark:border-slate-700">
                    <td className="py-2 px-3 font-medium">{cat.name}</td>
                    <td className="py-2 px-3 text-right">{cat.sold}</td>
                    <td className="py-2 px-3 text-right">{cat.available}</td>
                    <td className="py-2 px-3 text-right">Rp {cat.revenue.toLocaleString('id-ID')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="text-slate-500">Belum ada data penjualan</p>
        )}
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="text-lg font-semibold mb-4">Detail Event</h2>
        <div className="grid grid-cols-2 gap-4 text-sm">
          <div>
            <span className="text-slate-500">Tanggal:</span>{' '}
            {formatDate(event.startDate)}
          </div>
          <div>
            <span className="text-slate-500">Kota:</span> {event.city}
          </div>
          <div>
            <span className="text-slate-500">Status:</span> {event.status}
          </div>
          <div>
            <span className="text-slate-500">Multi-hari:</span> {event.isMultiDay ? 'Ya' : 'Tidak'}
          </div>
        </div>
        {event.shortDescription && (
          <p className="mt-4 text-slate-600 dark:text-slate-300">{event.shortDescription}</p>
        )}
      </div>
    </div>
  );
}
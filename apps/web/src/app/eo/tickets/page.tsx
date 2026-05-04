'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { InternalTicketGenerator } from '@/components/eo/InternalTicketGenerator';
import {
  BarChart3,
  CalendarDays,
  ChevronRight,
  CircleDollarSign,
  Edit,
  Info,
  Ticket,
  TrendingUp,
  Users,
} from 'lucide-react';

interface EventItem {
  id: string;
  title: string;
  status: string;
  categories?: {
    id: string;
    isInternal: boolean;
  }[];
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

export default function EOTicketsPage() {
  const router = useRouter();
  const toast = useToast();
  const { user } = useAuthStore();

  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [summary, setSummary] = useState<Summary | null>(null);
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [error, setError] = useState('');
  const [eventDropdownOpen, setEventDropdownOpen] = useState(false);
  const eventDropdownRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  useEffect(() => {
    const loadEvents = async () => {
      if (!user || user.role !== 'EO_ADMIN') return;
      setLoadingEvents(true);
      setError('');
      try {
        const res = await api.get('/api/eo/events?page=1&limit=100');
        const body = res.data as any;
        const items = (body?.data || body?.events || body || []) as EventItem[];
        setEvents(items);
        setSelectedEventId((prev) => (items.some((event) => event.id === prev) ? prev : (items[0]?.id || '')));
      } catch (err) {
        setError(getApiError(err).error);
      } finally {
        setLoadingEvents(false);
      }
    };

    loadEvents();
  }, [user]);

  useEffect(() => {
    const loadSummary = async () => {
      if (!selectedEventId) {
        setSummary(null);
        return;
      }
      setLoadingSummary(true);
      setError('');
      try {
        const res = await api.get(`/api/eo/events/${selectedEventId}/dashboard/summary`);
        setSummary((res.data?.data || res.data) as Summary);
      } catch (err) {
        setError(getApiError(err).error);
        setSummary(null);
      } finally {
        setLoadingSummary(false);
      }
    };

    loadSummary();
  }, [selectedEventId]);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (!eventDropdownRef.current) {
        return;
      }

      if (!eventDropdownRef.current.contains(event.target as Node)) {
        setEventDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedEvent = useMemo(
    () => events.find((event) => event.id === selectedEventId) || null,
    [events, selectedEventId]
  );
  const selectedEventHasInternal = Boolean(selectedEvent?.categories?.some((category) => category.isInternal));
  const canGenerateInternal = user?.role === 'EO_ADMIN';

  const revenueShare = summary ? Math.min(100, Math.round(summary.quotaFillPercent)) : 0;
  const avgTicketRevenue =
    summary && summary.totalSold > 0 ? Math.round(summary.totalRevenue / summary.totalSold) : 0;
  const formatNumber = (value: number) => new Intl.NumberFormat('en-US').format(value);
  const formatCurrency = (value: number) => `Rp ${formatNumber(value)}`;

    if (!user || user.role !== 'EO_ADMIN') {
      return (
        <div className="min-h-screen flex items-center justify-center bg-slate-50 dark:bg-slate-950">
          <div className="h-10 w-10 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
        </div>
      );
  }

  return (
    <div className="space-y-6">
      <div className="relative overflow-hidden rounded-[2rem] border border-slate-200 bg-gradient-to-br from-slate-950 via-slate-900 to-emerald-950 px-6 py-7 text-white shadow-[0_28px_70px_rgba(15,23,42,0.22)] dark:border-slate-800">
        <div className="absolute inset-0 opacity-30">
          <div className="absolute -left-12 top-0 h-48 w-48 rounded-full bg-emerald-500/30 blur-3xl" />
          <div className="absolute right-0 top-10 h-56 w-56 rounded-full bg-cyan-500/20 blur-3xl" />
          <div className="absolute bottom-0 left-1/3 h-40 w-40 rounded-full bg-white/10 blur-3xl" />
        </div>

        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-end xl:justify-between">
          <div className="max-w-2xl">
            <div className="mb-3 inline-flex items-center gap-2 rounded-full border border-white/15 bg-white/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.24em] text-emerald-100">
              <BarChart3 className="h-3.5 w-3.5" />
              EO Ticket Overview
            </div>
            <h1 className="text-3xl font-semibold tracking-tight md:text-4xl" style={{ fontFamily: 'Manrope' }}>
              Manajemen Tiket
            </h1>
            <p className="mt-3 max-w-xl text-sm leading-6 text-slate-300 md:text-base">
              Pantau penjualan, kuota, dan revenue per event dalam satu dashboard yang lebih rapi dan mudah dibaca.
            </p>
            <div className="mt-5 flex flex-wrap items-center gap-3 text-sm">
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-slate-100 backdrop-blur">
                <CalendarDays className="h-4 w-4" />
                {selectedEvent?.title || 'Pilih event untuk melihat detail'}
              </span>
              <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3 py-2 text-slate-100 backdrop-blur">
                <Info className="h-4 w-4" />
                Data diperbarui dari summary dashboard
              </span>
            </div>
          </div>

          <Link href="/eo/events" className="relative">
            <Button
              variant="outline"
              className="border-white/20 bg-white/10 text-white hover:bg-white/20 hover:text-white"
            >
              Lihat Semua Event
              <ChevronRight className="ml-2 h-4 w-4" />
            </Button>
          </Link>
        </div>
      </div>

      <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="max-w-2xl">
            <label htmlFor="eventSelector" className="mb-2 block text-sm font-semibold text-slate-900 dark:text-white">
              Pilih Event
            </label>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Semua event milik EO Admin ditampilkan. Panel generate internal akan aktif hanya jika event punya kategori internal.
            </p>
          </div>

          <div className="relative w-full lg:w-[460px]" ref={eventDropdownRef}>
            <button
              type="button"
              onClick={() => setEventDropdownOpen(prev => !prev)}
              className="flex w-full items-center justify-between rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-left text-sm text-slate-900 outline-none transition-all hover:bg-white focus:border-emerald-500 focus:bg-white focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white dark:hover:bg-slate-900"
              disabled={loadingEvents || events.length === 0}
            >
              <span className="min-w-0">
                <span className="block truncate font-medium">
                  {selectedEvent?.title || 'Belum ada event'}
                </span>
                {selectedEvent ? (
                  <span className="mt-1 flex flex-wrap items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                    <span>{selectedEvent.status}</span>
                    {selectedEventHasInternal ? (
                      <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                        Internal
                      </span>
                    ) : null}
                  </span>
                ) : null}
              </span>
              <ChevronRight className={`h-4 w-4 transition-transform ${eventDropdownOpen ? 'rotate-90' : 'rotate-0'}`} />
            </button>

            {eventDropdownOpen ? (
              <div className="absolute z-20 mt-2 w-full overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-950 dark:shadow-black/20">
                <div className="max-h-80 overflow-auto p-2">
                  {events.length === 0 ? (
                    <div className="px-3 py-2 text-sm text-slate-500 dark:text-slate-400">Belum ada event</div>
                  ) : (
                    events.map((event) => {
                      const hasInternal = Boolean(event.categories?.some((category) => category.isInternal));
                      const isSelected = event.id === selectedEventId;
                      return (
                        <button
                          key={event.id}
                          type="button"
                          onClick={() => {
                            setSelectedEventId(event.id);
                            setEventDropdownOpen(false);
                          }}
                          className={`flex w-full items-center justify-between rounded-xl px-3 py-2 text-left transition-colors ${
                            isSelected
                              ? 'bg-emerald-50 text-emerald-900 dark:bg-emerald-500/10 dark:text-emerald-200'
                              : 'hover:bg-slate-50 dark:hover:bg-slate-900'
                          }`}
                        >
                          <span className="min-w-0">
                            <span className="block truncate font-medium">{event.title}</span>
                            <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                              {event.status}
                            </span>
                          </span>
                          {hasInternal ? (
                            <span className="ml-3 inline-flex shrink-0 items-center rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                              Internal
                            </span>
                          ) : null}
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {error ? (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 shadow-sm dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {loadingEvents || loadingSummary ? (
        <div className="flex justify-center py-14">
          <div className="h-10 w-10 rounded-full border-2 border-emerald-600 border-t-transparent animate-spin" />
        </div>
      ) : !selectedEvent || !summary ? (
        <div className="rounded-3xl border border-dashed border-slate-200 bg-white px-8 py-14 text-center text-slate-500 shadow-sm dark:border-slate-800 dark:bg-slate-900/70">
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-slate-100 text-slate-400 dark:bg-slate-800">
            <Ticket className="h-6 w-6" />
          </div>
          <p className="text-base font-medium text-slate-700 dark:text-slate-200">
            Tidak ada data tiket untuk ditampilkan.
          </p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Pilih event lain atau pastikan event sudah memiliki kategori tiket.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 xl:grid-cols-4">
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
                <Ticket className="h-5 w-5" />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {formatNumber(summary.totalSold)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Tiket Terjual</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-blue-50 text-blue-600 dark:bg-blue-500/10">
                <Users className="h-5 w-5" />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {formatNumber(summary.totalQuota)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Total Kuota</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-600 dark:bg-amber-500/10">
                <CircleDollarSign className="h-5 w-5" />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {formatCurrency(summary.totalRevenue)}
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Gross Revenue</p>
            </div>
            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
              <div className="mb-4 flex h-12 w-12 items-center justify-center rounded-2xl bg-purple-50 text-purple-600 dark:bg-purple-500/10">
                <TrendingUp className="h-5 w-5" />
              </div>
              <p className="text-3xl font-semibold tracking-tight text-slate-900 dark:text-white">
                {formatNumber(summary.quotaFillPercent)}%
              </p>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Kuota Terisi</p>
            </div>
          </div>

          <div className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
            <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
              <div>
                <h2 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
                  Kategori Tiket
                </h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                  Ringkasan distribusi kuota dan pendapatan per kategori.
                </p>
              </div>
              <div className="flex flex-wrap gap-2">
                <Button
                  variant="outline"
                  onClick={() => router.push(`/eo/events/${selectedEvent.id}`)}
                  className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                >
                  Detail Event
                </Button>
                <Button
                  onClick={() => router.push(`/eo/events/${selectedEvent.id}/manage`)}
                  className="shadow-sm shadow-emerald-600/15"
                >
                  <Edit className="mr-2 h-4 w-4" />
                  Kelola Tiket
                </Button>
              </div>
            </div>

          <div className="mt-5 grid gap-4 lg:grid-cols-[1.2fr_0.8fr]">
            <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Fill Rate</p>
                  <p className="mt-1 text-2xl font-semibold tracking-tight text-slate-900 dark:text-white">
                    {formatNumber(summary.quotaFillPercent)}%
                  </p>
                </div>
                <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-600 text-white">
                  <TrendingUp className="h-5 w-5" />
                </div>
              </div>

              <div className="mt-4 h-3 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-emerald-500 via-teal-500 to-cyan-500 transition-all"
                  style={{ width: `${revenueShare}%` }}
                />
              </div>

              <div className="mt-4 grid grid-cols-2 gap-3">
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Avg Ticket</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(avgTicketRevenue)}
                  </p>
                </div>
                <div className="rounded-2xl bg-white p-4 shadow-sm dark:bg-slate-900">
                  <p className="text-xs uppercase tracking-[0.2em] text-slate-400">Net Revenue</p>
                  <p className="mt-2 text-lg font-semibold text-slate-900 dark:text-white">
                    {formatCurrency(summary.netRevenue)}
                  </p>
                </div>
              </div>
            </div>

            <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Event Detail</p>
              <div className="mt-4 space-y-3 text-sm">
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                  <span className="text-slate-500 dark:text-slate-400">Event</span>
                  <span className="font-medium text-slate-900 dark:text-white">{selectedEvent.title}</span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                  <span className="text-slate-500 dark:text-slate-400">Status</span>
                  <span className="inline-flex items-center rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                    {selectedEvent.status}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-4 rounded-2xl bg-slate-50 px-4 py-3 dark:bg-slate-900">
                  <span className="text-slate-500 dark:text-slate-400">Platform Fee</span>
                  <span className="font-medium text-slate-900 dark:text-white">
                    {formatNumber(summary.platformFeePercent)}%
                  </span>
                </div>
              </div>
            </div>
          </div>

            {summary.categorySummary.length === 0 ? (
              <p className="mt-5 text-sm text-slate-500 dark:text-slate-400">
                Belum ada kategori tiket pada event ini.
              </p>
            ) : (
              <div className="mt-6 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
                <div className="overflow-x-auto">
                  <table className="min-w-full text-sm">
                    <thead className="bg-slate-50 dark:bg-slate-950">
                      <tr className="text-left">
                        <th className="px-4 py-3 font-medium text-slate-500">Kategori</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">Kuota</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">Terjual</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">Tersedia</th>
                        <th className="px-4 py-3 text-right font-medium text-slate-500">Revenue</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                      {summary.categorySummary.map((cat) => (
                        <tr key={cat.categoryId} className="transition-colors hover:bg-slate-50/70 dark:hover:bg-slate-900/60">
                          <td className="px-4 py-4 font-medium text-slate-900 dark:text-white">
                            {cat.name}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-600 dark:text-slate-300">
                            {formatNumber(cat.quota)}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-600 dark:text-slate-300">
                            {formatNumber(cat.sold)}
                          </td>
                          <td className="px-4 py-4 text-right text-slate-600 dark:text-slate-300">
                            {formatNumber(cat.available)}
                          </td>
                          <td className="px-4 py-4 text-right font-medium text-slate-900 dark:text-white">
                            {formatCurrency(cat.revenue)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            <div className="mt-8">
              <InternalTicketGenerator eventId={selectedEvent.id} canGenerate={canGenerateInternal} />
            </div>
          </div>
        </>
      )}
    </div>
  );
}

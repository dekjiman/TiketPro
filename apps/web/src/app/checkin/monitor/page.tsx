'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

type EoEvent = {
  id: string;
  title: string;
};

type Summary = {
  eventId: string;
  totalTickets: number;
  checkedIn: number;
  remaining: number;
};

type HistoryItem = {
  id: string;
  createdAt: string;
  result: string;
  gate: { id: string; name: string };
  ticket: { ticketCode: string; holderName: string; category: string } | null;
};

export default function CheckinMonitorPage() {
  const router = useRouter();
  const toast = useToast();
  const { user, _hasHydrated } = useAuthStore();

  const [events, setEvents] = useState<EoEvent[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [loadingEvents, setLoadingEvents] = useState(true);
  const [summary, setSummary] = useState<Summary | null>(null);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const intervalRef = useRef<any>(null);

  const canAccess = useMemo(() => {
    if (!user) return false;
    return user.role === 'EO_ADMIN' || user.role === 'SUPER_ADMIN';
  }, [user]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user) {
      router.replace('/login?redirect=/checkin/monitor');
      return;
    }
    if (!canAccess) {
      toast.showToast('error', 'Access denied');
      router.replace('/dashboard');
    }
  }, [_hasHydrated, user, canAccess, router]);

  useEffect(() => {
    if (!_hasHydrated || !canAccess) return;
    let mounted = true;

    const loadEvents = async () => {
      setLoadingEvents(true);
      try {
        const res = await api.get<{ data: EoEvent[] }>('/api/eo/events?limit=100&page=1');
        if (!mounted) return;
        setEvents(res.data?.data || []);
      } catch (err) {
        if (!mounted) return;
        toast.showToast('error', getApiError(err).error || 'Gagal memuat event');
      } finally {
        if (mounted) setLoadingEvents(false);
      }
    };

    loadEvents();
    return () => {
      mounted = false;
    };
    // Intentionally not depending on `toast` object to avoid ref churn re-running effects.
  }, [_hasHydrated, canAccess]);

  const refresh = async () => {
    if (!selectedEventId) return;
    setRefreshing(true);
    try {
      const [summaryRes, historyRes] = await Promise.all([
        api.get<Summary>(`/api/checkin/summary?eventId=${encodeURIComponent(selectedEventId)}`),
        api.get<{ data: HistoryItem[] }>(
          `/api/checkin/history?eventId=${encodeURIComponent(selectedEventId)}&limit=30&page=1`
        ),
      ]);
      setSummary(summaryRes.data);
      setHistory(historyRes.data?.data || []);
    } catch (err) {
      toast.showToast('error', getApiError(err).error || 'Gagal memuat data monitor');
    } finally {
      setRefreshing(false);
    }
  };

  useEffect(() => {
    if (!selectedEventId) {
      setSummary(null);
      setHistory([]);
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
      return;
    }

    refresh();
    if (intervalRef.current) clearInterval(intervalRef.current);
    intervalRef.current = setInterval(refresh, 2500);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      intervalRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedEventId]);

  if (!_hasHydrated || !user || !canAccess) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6 p-4">
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-5">
        <div className="flex items-start justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold" style={{ fontFamily: 'Manrope' }}>
              Check-in Monitor
            </h1>
            <p className="text-sm text-slate-500">Auto refresh tiap 2.5 detik</p>
          </div>
          <Button onClick={refresh} loading={refreshing} disabled={!selectedEventId}>
            Refresh
          </Button>
        </div>

        <div className="mt-4">
          <label className="block text-sm font-medium text-slate-700 dark:text-slate-200 mb-1.5">Event</label>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={loadingEvents}
            className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 outline-none"
          >
            <option value="">Pilih event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
      </div>

      {summary ? (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs text-slate-500">Total</div>
            <div className="text-2xl font-bold">{summary.totalTickets}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs text-slate-500">Checked-in</div>
            <div className="text-2xl font-bold text-emerald-600">{summary.checkedIn}</div>
          </div>
          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className="text-xs text-slate-500">Remaining</div>
            <div className="text-2xl font-bold text-slate-700 dark:text-slate-100">{summary.remaining}</div>
          </div>
        </div>
      ) : null}

      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden">
        <div className="p-4 border-b border-slate-200 dark:border-slate-700">
          <div className="font-semibold">Recent Scans</div>
          <div className="text-xs text-slate-500">Menampilkan 30 scan terakhir</div>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 dark:bg-slate-900/40">
              <tr>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Waktu</th>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Gate</th>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Ticket</th>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Nama</th>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Kategori</th>
                <th className="text-left px-4 py-3 text-slate-600 dark:text-slate-300">Result</th>
              </tr>
            </thead>
            <tbody>
              {history.length === 0 ? (
                <tr>
                  <td className="px-4 py-6 text-slate-500" colSpan={6}>
                    {selectedEventId ? 'Belum ada scan.' : 'Pilih event dulu.'}
                  </td>
                </tr>
              ) : (
                history.map((h) => (
                  <tr key={h.id} className="border-t border-slate-200 dark:border-slate-700">
                    <td className="px-4 py-3 whitespace-nowrap">{new Date(h.createdAt).toLocaleString()}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{h.gate?.name || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{h.ticket?.ticketCode || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{h.ticket?.holderName || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap">{h.ticket?.category || '-'}</td>
                    <td className="px-4 py-3 whitespace-nowrap font-semibold">{h.result}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import LotterySettingsPage from './LotterySettingsPage';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui';

export default function LotterySettingsRoutePage() {
  const toast = useToast();
  const search = useSearchParams();
  const queryEventId = search.get('eventId') || '';
  const [events, setEvents] = useState<Array<{ id: string; title: string }>>([]);
  const [selectedEventId, setSelectedEventId] = useState(queryEventId);
  const [loadingEvents, setLoadingEvents] = useState(true);

  useEffect(() => {
    const loadEvents = async () => {
      setLoadingEvents(true);
      try {
        const res = await api.get('/api/eo/events?limit=100&page=1');
        const list = res.data?.data || [];
        setEvents(list);
        if (!selectedEventId && list.length > 0) {
          setSelectedEventId(list[0].id);
        }
      } catch (err) {
        toast.showToast('error', getApiError(err).error || 'Gagal memuat event');
      } finally {
        setLoadingEvents(false);
      }
    };
    void loadEvents();
  }, []);

  if (!selectedEventId) {
    return (
      <div className="mx-auto max-w-2xl p-6 space-y-3">
        <h1 className="text-xl font-bold">Lottery Settings</h1>
        <p className="text-sm text-slate-600">Pilih event untuk mengatur lottery.</p>
        <select
          value={selectedEventId}
          onChange={(e) => setSelectedEventId(e.target.value)}
          disabled={loadingEvents}
          className="w-full h-11 rounded-lg border border-slate-300 bg-white px-3 text-sm"
        >
          <option value="">Pilih Event</option>
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title}
            </option>
          ))}
        </select>
        <Button disabled={!selectedEventId} onClick={() => setSelectedEventId(selectedEventId)}>
          Buka Settings
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="mx-auto max-w-5xl px-4 pt-4">
        <div className="rounded-lg border bg-white p-3 flex items-center gap-3">
          <span className="text-sm text-slate-600">Event:</span>
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={loadingEvents}
            className="h-9 rounded border border-slate-300 px-2 text-sm"
          >
            {events.map((ev) => (
              <option key={ev.id} value={ev.id}>
                {ev.title}
              </option>
            ))}
          </select>
        </div>
      </div>
      <LotterySettingsPage eventId={selectedEventId} />
    </div>
  );
}

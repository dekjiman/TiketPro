'use client';

import { useEffect, useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { BigScreenLottery } from '@/components/lottery/BigScreenLottery';
import type { LotteryPrize } from '@/hooks/useLottery';

type EventItem = {
  id: string;
  title: string;
};

export default function EoLotteryPage() {
  const [events, setEvents] = useState<EventItem[]>([]);
  const [selectedEventId, setSelectedEventId] = useState('');
  const [eventTitle, setEventTitle] = useState('');
  const [prizes, setPrizes] = useState<LotteryPrize[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const loadEvents = async () => {
      setLoading(true);
      try {
        const res = await api.get('/api/eo/events?limit=100&page=1');
        setEvents(res.data?.data || []);
      } catch (err) {
        setError(getApiError(err).error || 'Gagal memuat event');
      } finally {
        setLoading(false);
      }
    };
    void loadEvents();
  }, []);

  const loadPrizes = async () => {
    if (!selectedEventId) return;
    setError(null);
    try {
      const res = await api.get(`/api/lottery/by-event/${selectedEventId}`);
      setPrizes(res.data?.prizes || []);
      setEventTitle(res.data?.event?.title || 'Live Lottery Draw');
      setReady(true);
    } catch (err) {
      setError(getApiError(err).error || 'Gagal memuat prize lottery');
      setReady(false);
    }
  };

  if (ready) {
    return (
      <BigScreenLottery
        eventId={selectedEventId}
        eventTitle={eventTitle}
        prizes={prizes}
        onRefreshPrizes={loadPrizes}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#0B0B0B] text-white flex items-center justify-center p-6">
      <div className="w-full max-w-xl rounded-2xl border border-white/10 bg-white/5 p-6">
        <h1 className="text-2xl font-bold">Undian Big Screen</h1>
        <p className="text-sm text-white/70 mt-1">Pilih event untuk masuk ke mode layar besar.</p>
        <div className="mt-5 space-y-3">
          <select
            value={selectedEventId}
            onChange={(e) => setSelectedEventId(e.target.value)}
            disabled={loading}
            className="w-full h-11 rounded-lg bg-white/10 border border-white/20 px-3 text-sm text-white"
          >
            <option value="" className="bg-white text-black">Pilih Event</option>
            {events.map((ev) => (
              <option key={ev.id} value={ev.id} className="bg-white text-black">
                {ev.title}
              </option>
            ))}
          </select>
          <Button onClick={() => void loadPrizes()} disabled={!selectedEventId || loading} className="w-full">
            Masuk Big Screen
          </Button>
          {error && <div className="text-sm text-red-400">{error}</div>}
        </div>
      </div>
    </div>
  );
}

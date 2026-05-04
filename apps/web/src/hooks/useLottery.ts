'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import { api, getApiError } from '@/lib/api';

export interface LotteryPrize {
  id: string;
  prizeId: string;
  name: string;
  imageUrl?: string;
  quota: number;
  remainingQuota: number;
  winners?: LotteryWinnerHistoryItem[];
}

export interface LotteryWinner {
  ticketId: string;
  ticketCode: string;
  userName: string;
}

export interface LotteryWinnerHistoryItem extends LotteryWinner {
  prizeId: string;
  confirmedAt: string;
}

interface UseLotteryParams {
  eventId: string;
  prizes: LotteryPrize[];
}

const DUMMY_POOL = [
  'ALPHA-1029',
  'TIX-889100',
  'USER-RENATA',
  'QZ-440012',
  'LUCKY-7710',
  'NOVA-5528',
  'ENTRY-9902',
  'PRM-347721',
];

export function useLottery({ eventId, prizes }: UseLotteryParams) {
  const [isRunning, setIsRunning] = useState(false);
  const [isStopping, setIsStopping] = useState(false);
  const [currentDisplay, setCurrentDisplay] = useState('READY');
  const [winner, setWinner] = useState<LotteryWinner | null>(null);
  const [selectedPrizeId, setSelectedPrizeId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isConfirming, setIsConfirming] = useState(false);
  const timerRef = useRef<number | null>(null);

  const selectedPrize = useMemo(
    () => prizes.find((p) => p.prizeId === selectedPrizeId) || null,
    [prizes, selectedPrizeId]
  );

  const clearTicker = useCallback(() => {
    if (timerRef.current) {
      window.clearTimeout(timerRef.current);
      timerRef.current = null;
    }
  }, []);

  const runTicker = useCallback((slowMode = false) => {
    clearTicker();
    const tick = () => {
      const randomValue = DUMMY_POOL[Math.floor(Math.random() * DUMMY_POOL.length)];
      setCurrentDisplay(randomValue);
      const delay = slowMode ? 180 + Math.floor(Math.random() * 100) : 80 + Math.floor(Math.random() * 40);
      timerRef.current = window.setTimeout(tick, delay);
    };
    tick();
  }, [clearTicker]);

  const startDraw = useCallback(() => {
    if (!selectedPrize || selectedPrize.remainingQuota <= 0 || !eventId) return;
    setError(null);
    setWinner(null);
    setIsStopping(false);
    setIsRunning(true);
    runTicker(false);
  }, [eventId, runTicker, selectedPrize]);

  const stopDraw = useCallback(async () => {
    if (!isRunning || isStopping || !selectedPrize || !eventId) return;
    setError(null);
    setIsStopping(true);
    runTicker(true);
    await new Promise((r) => setTimeout(r, 800));
    clearTicker();

    try {
      const res = await api.post('/api/lottery/pick-one', {
        eventId,
        prizeId: selectedPrize.prizeId,
      });
      const picked = res.data as LotteryWinner;
      setWinner(picked);
      setCurrentDisplay(picked.ticketCode || picked.userName);
    } catch (err) {
      setError(getApiError(err).error || 'Gagal pick winner');
    } finally {
      setIsRunning(false);
      setIsStopping(false);
    }
  }, [clearTicker, eventId, isRunning, isStopping, runTicker, selectedPrize]);

  const confirmWinner = useCallback(async () => {
    if (!winner || !selectedPrize || !eventId || isConfirming) return false;
    setIsConfirming(true);
    setError(null);
    try {
      await api.post('/api/lottery/confirm', {
        eventId,
        ticketId: winner.ticketId,
        prizeId: selectedPrize.prizeId,
      });
      return true;
    } catch (err) {
      setError(getApiError(err).error || 'Gagal konfirmasi winner');
      return false;
    } finally {
      setIsConfirming(false);
    }
  }, [eventId, isConfirming, selectedPrize, winner]);

  return {
    isRunning,
    isStopping,
    currentDisplay,
    winner,
    selectedPrize,
    selectedPrizeId,
    setSelectedPrizeId,
    error,
    isConfirming,
    startDraw,
    stopDraw,
    confirmWinner,
    canStart: Boolean(eventId && selectedPrize && selectedPrize.remainingQuota > 0),
  };
}

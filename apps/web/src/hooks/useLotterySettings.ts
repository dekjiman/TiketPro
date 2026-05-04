'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getApiError } from '@/lib/api';

export type DrawMode = 'BATCH' | 'LIVE';

export interface LotteryConfigPayload {
  id?: string | null;
  eventId: string;
  isEnabled: boolean;
  drawMode: DrawMode;
  allowMultipleWin: boolean;
  eligibleStatus: 'CHECKED_IN';
  maxWinnerPerTicket: number;
  cooldownSeconds: number;
}

export interface PrizePayload {
  id: string;
  eventId: string;
  name: string;
  description?: string | null;
  imageUrl?: string | null;
  totalWinner: number;
  remainingWinner: number;
  order: number;
}

export function useLotterySettings(eventId: string) {
  const [config, setConfig] = useState<LotteryConfigPayload | null>(null);
  const [prizes, setPrizes] = useState<PrizePayload[]>([]);
  const [eligibleCount, setEligibleCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const loadAll = useCallback(async () => {
    if (!eventId) return;
    setLoading(true);
    setError(null);
    try {
      const [configRes, prizeRes] = await Promise.all([
        api.get(`/api/lottery/config?eventId=${encodeURIComponent(eventId)}`),
        api.get(`/api/prizes?eventId=${encodeURIComponent(eventId)}`),
      ]);
      setConfig(configRes.data?.config || null);
      setEligibleCount(configRes.data?.meta?.eligibleCount || 0);
      setPrizes(prizeRes.data || []);
    } catch (err) {
      setError(getApiError(err).error || 'Gagal memuat lottery settings');
    } finally {
      setLoading(false);
    }
  }, [eventId]);

  useEffect(() => {
    void loadAll();
  }, [loadAll]);

  const hasDuplicateOrder = useMemo(() => {
    const map = new Set<number>();
    for (const p of prizes) {
      if (map.has(p.order)) return true;
      map.add(p.order);
    }
    return false;
  }, [prizes]);

  const validateBeforeSave = useCallback((draft: LotteryConfigPayload) => {
    if (!eventId) return 'Event belum dipilih';
    if (prizes.length < 1) return 'Minimal harus ada 1 prize';
    if (prizes.some((p) => p.totalWinner <= 0)) return 'totalWinner harus lebih dari 0';
    if (hasDuplicateOrder) return 'Order prize tidak boleh duplikat';
    if (draft.isEnabled && eligibleCount <= 0) return 'Belum ada tiket check-in yang eligible';
    if (draft.isEnabled && !prizes.some((p) => p.remainingWinner > 0)) return 'Semua quota prize habis';
    return null;
  }, [eligibleCount, eventId, hasDuplicateOrder, prizes]);

  const saveConfig = useCallback(async (draft: LotteryConfigPayload) => {
    const validationError = validateBeforeSave(draft);
    if (validationError) {
      return { ok: false, error: validationError };
    }
    setSaving(true);
    try {
      const payload = {
        ...draft,
        eventId,
      };
      const res = draft.id
        ? await api.put(`/api/lottery/config/${draft.id}`, payload)
        : await api.post('/api/lottery/config', payload);
      setConfig(res.data);
      return { ok: true };
    } catch (err) {
      return { ok: false, error: getApiError(err).error || 'Gagal menyimpan settings' };
    } finally {
      setSaving(false);
    }
  }, [eventId, validateBeforeSave]);

  return {
    config,
    prizes,
    eligibleCount,
    loading,
    saving,
    error,
    setConfig,
    loadAll,
    saveConfig,
  };
}

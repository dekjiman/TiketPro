'use client';

import { useEffect, useMemo, useState } from 'react';
import { useToast, Button, Input } from '@/components/ui';
import { useLotterySettings, type LotteryConfigPayload, type PrizePayload } from '@/hooks/useLotterySettings';
import { PrizeForm } from '@/components/lottery/PrizeForm';
import { api, getApiError } from '@/lib/api';

interface LotterySettingsPageProps {
  eventId: string;
}

interface LotteryWinnerItem {
  id: string;
  eventId: string;
  prizeId: string;
  ticketId: string;
  ticketCode: string;
  userName: string;
  confirmedAt: string;
  prize: {
    name: string;
    order: number;
  };
}

export default function LotterySettingsPage({ eventId }: LotterySettingsPageProps) {
  const toast = useToast();
  const { config, prizes, eligibleCount, loading, saving, error, setConfig, saveConfig, loadAll } = useLotterySettings(eventId);
  const [editingPrize, setEditingPrize] = useState<PrizePayload | null>(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [winners, setWinners] = useState<LotteryWinnerItem[]>([]);
  const [loadingWinners, setLoadingWinners] = useState(false);

  const loadWinners = async () => {
    if (!eventId) return;
    setLoadingWinners(true);
    try {
      const res = await api.get(`/api/prizes/winners?eventId=${encodeURIComponent(eventId)}`);
      setWinners(res.data || []);
    } catch {
      setWinners([]);
    } finally {
      setLoadingWinners(false);
    }
  };

  useEffect(() => {
    void loadWinners();
  }, [eventId]);

  const draft = useMemo<LotteryConfigPayload>(() => ({
    id: config?.id || null,
    eventId,
    isEnabled: config?.isEnabled || false,
    drawMode: config?.drawMode || 'LIVE',
    allowMultipleWin: config?.allowMultipleWin || false,
    eligibleStatus: 'CHECKED_IN',
    maxWinnerPerTicket: config?.maxWinnerPerTicket || 1,
    cooldownSeconds: config?.cooldownSeconds || 3,
  }), [config, eventId]);

  const setDraft = (patch: Partial<LotteryConfigPayload>) => {
    setConfig({ ...draft, ...patch });
  };

  const upsertPrize = async (payload: Omit<PrizePayload, 'id'>) => {
    try {
      if (editingPrize) {
        await api.put(`/api/prizes/${editingPrize.id}`, payload);
        toast.showToast('success', 'Prize berhasil diupdate');
      } else {
        await api.post('/api/prizes', payload);
        toast.showToast('success', 'Prize berhasil ditambahkan');
      }
      setEditingPrize(null);
      setShowAddForm(false);
      await loadAll();
    } catch (err) {
      toast.showToast('error', getApiError(err).error || 'Gagal menyimpan prize');
    }
  };

  const deletePrize = async (id: string) => {
    try {
      await api.delete(`/api/prizes/${id}`);
      toast.showToast('success', 'Prize dihapus');
      await loadAll();
      await loadWinners();
    } catch (err) {
      toast.showToast('error', getApiError(err).error || 'Gagal menghapus prize');
    }
  };

  const revokeWinner = async (winnerId: string) => {
    try {
      await api.post(`/api/prizes/winners/${winnerId}/revoke`);
      toast.showToast('success', 'Pemenang dibatalkan');
      await Promise.all([loadAll(), loadWinners()]);
    } catch (err) {
      toast.showToast('error', getApiError(err).error || 'Gagal membatalkan pemenang');
    }
  };

  if (loading && !config) {
    return <div className="p-6 text-sm text-slate-600">Loading lottery settings...</div>;
  }

  return (
    <div className="mx-auto max-w-5xl p-4 lg:p-6 space-y-4">
      <div className="rounded-xl border bg-white p-5">
        <h1 className="text-2xl font-bold">Lottery Settings</h1>
        <p className="text-sm text-slate-500 mt-1">Konfigurasi undian untuk event ini.</p>
        {error && <p className="mt-3 text-sm text-red-600">{error}</p>}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">A. Toggle Lottery</h2>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.isEnabled}
              onChange={(e) => setDraft({ isEnabled: e.target.checked })}
            />
            Lottery Enabled
          </label>
        </section>

        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">B. Draw Mode</h2>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={draft.drawMode === 'BATCH'} onChange={() => setDraft({ drawMode: 'BATCH' })} />
            Batch Random (ambil N langsung)
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input type="radio" checked={draft.drawMode === 'LIVE'} onChange={() => setDraft({ drawMode: 'LIVE' })} />
            Live Draw (press SPACE)
          </label>
        </section>

        <section className="rounded-xl border bg-white p-5 space-y-4">
          <h2 className="font-semibold">C. Rules</h2>
          <label className="inline-flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={draft.allowMultipleWin}
              onChange={(e) => setDraft({ allowMultipleWin: e.target.checked })}
            />
            allowMultipleWin
          </label>
          <div className="grid grid-cols-2 gap-2">
            <Input
              type="number"
              min={0}
              value={draft.cooldownSeconds}
              onChange={(e) => setDraft({ cooldownSeconds: Number(e.target.value || 0) })}
              placeholder="cooldownSeconds"
            />
            <Input
              type="number"
              min={1}
              value={draft.maxWinnerPerTicket}
              onChange={(e) => setDraft({ maxWinnerPerTicket: Number(e.target.value || 1) })}
              placeholder="maxWinnerPerTicket"
            />
          </div>
        </section>

        <section className="rounded-xl border bg-white p-5 space-y-2">
          <h2 className="font-semibold">D. Eligible Filter</h2>
          <p className="text-sm">CHECKED_IN only (read-only)</p>
          <p className="text-xs text-slate-500">Eligible tickets: {eligibleCount}</p>
        </section>
      </div>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">E. Prize Management</h2>
          <Button variant="outline" onClick={() => { setShowAddForm((v) => !v); setEditingPrize(null); }}>
            {showAddForm ? 'Tutup Form' : 'Tambah Prize'}
          </Button>
        </div>

        {showAddForm && !editingPrize && (
          <PrizeForm
            eventId={eventId}
            defaultOrder={(Math.max(0, ...prizes.map((p) => p.order)) || 0) + 1}
            onSubmit={upsertPrize}
            onCancel={() => setShowAddForm(false)}
          />
        )}
        {editingPrize && (
          <PrizeForm eventId={eventId} initialValue={editingPrize} onSubmit={upsertPrize} onCancel={() => setEditingPrize(null)} />
        )}

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Order</th>
                <th className="text-left py-2">Name</th>
                <th className="text-left py-2">Total</th>
                <th className="text-left py-2">Remaining</th>
                <th className="text-left py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {prizes.map((p) => (
                <tr key={p.id} className="border-b">
                  <td className="py-2">{p.order}</td>
                  <td className="py-2">{p.name}</td>
                  <td className="py-2">{p.totalWinner}</td>
                  <td className="py-2">{p.remainingWinner}</td>
                  <td className="py-2 space-x-2">
                    <Button size="sm" variant="outline" onClick={() => { setEditingPrize(p); setShowAddForm(false); }}>
                      Edit
                    </Button>
                    <Button size="sm" variant="outline" onClick={() => void deletePrize(p.id)}>
                      Delete
                    </Button>
                  </td>
                </tr>
              ))}
              {prizes.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">Belum ada prize</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="rounded-xl border bg-white p-5 space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-semibold">F. List Pemenang Undian</h2>
          <Button variant="outline" onClick={() => void loadWinners()} disabled={loadingWinners}>
            {loadingWinners ? 'Loading...' : 'Refresh'}
          </Button>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b">
                <th className="text-left py-2">Waktu</th>
                <th className="text-left py-2">Prize</th>
                <th className="text-left py-2">Nama</th>
                <th className="text-left py-2">Ticket</th>
                <th className="text-left py-2">Aksi</th>
              </tr>
            </thead>
            <tbody>
              {winners.map((w) => (
                <tr key={w.id} className="border-b">
                  <td className="py-2">{new Date(w.confirmedAt).toLocaleString('id-ID')}</td>
                  <td className="py-2">#{w.prize?.order} {w.prize?.name}</td>
                  <td className="py-2">{w.userName}</td>
                  <td className="py-2 font-medium">{w.ticketCode}</td>
                  <td className="py-2">
                    <Button size="sm" variant="outline" onClick={() => void revokeWinner(w.id)}>
                      Batalkan
                    </Button>
                  </td>
                </tr>
              ))}
              {winners.length === 0 && (
                <tr>
                  <td colSpan={5} className="py-4 text-center text-slate-500">
                    {loadingWinners ? 'Memuat pemenang...' : 'Belum ada pemenang'}
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <div className="flex justify-end">
        <Button
          disabled={saving}
          onClick={async () => {
            const res = await saveConfig(draft);
            if (!res.ok) {
              toast.showToast('error', res.error || 'Gagal menyimpan settings');
              return;
            }
            toast.showToast('success', 'Lottery settings berhasil disimpan');
            await Promise.all([loadAll(), loadWinners()]);
          }}
        >
          {saving ? 'Saving...' : 'Save Settings'}
        </Button>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { Loader2, Save, Calendar, Plus, Trash2, Edit, Clock, X } from 'lucide-react';

interface RundownItem {
  id?: string;
  title: string;
  startTime: string;
  endTime?: string;
  stage?: string;
  description?: string;
  sessionType: string;
  orderIndex: number;
  dayIndex: number;
}

interface RundownFormProps {
  initialData: RundownItem[];
  eventId: string;
  onUpdate?: () => void;
}

// Helpers
function isoToTime(isoStr?: string): string {
  if (!isoStr) return '';
  const d = new Date(isoStr);
  if (isNaN(d.getTime())) return '';
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function dateAndTimeToISO(base: Date | null, time: string): string {
  if (!base || !time) return '';
  const [h = 0, m = 0] = time.split(':').map(Number);
  const d = new Date(base);
  d.setHours(h, m, 0, 0);
  return d.toISOString();
}

export function RundownForm({ initialData, eventId, onUpdate }: RundownFormProps) {
  const [rundowns, setRundowns] = useState<RundownItem[]>(initialData);
  const [loading, setLoading] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<RundownItem | null>(null);
  const [eventStartDate, setEventStartDate] = useState<Date | null>(null);
  const toast = useToast();

  // Load event date
  useEffect(() => {
    const load = async () => {
      try {
        const res = await api.get(`/api/events/${eventId}`);
        const data = res.data?.data || res.data;
        if (data?.startDate) {
          const [y, m, d] = data.startDate.split('T')[0].split('-').map(Number);
          setEventStartDate(new Date(y, m - 1, d));
        }
      } catch (e) { console.error(e); }
    };
    load();
  }, [eventId]);

  // Set initial data
  useEffect(() => {
    const valid = (initialData || []).filter((r): r is RundownItem => r && 'id' in r);
    setRundowns(valid);
  }, [initialData]);

  const handleSave = async (fd: {
    title: string; startTime: string; endTime?: string;
    stage?: string; description?: string; sessionType: string;
    orderIndex: number; dayIndex: number;
  }) => {
    if (!eventStartDate) {
      toast.showToast('error', 'Data event belum dimuat');
      return;
    }

    setLoading(true);
    try {
      const base = new Date(eventStartDate);
      base.setDate(base.getDate() + (fd.dayIndex - 1));

      const payload: any = {
        title: fd.title,
        orderIndex: fd.orderIndex,
        dayIndex: fd.dayIndex,
        sessionType: fd.sessionType,
        startTime: dateAndTimeToISO(base, fd.startTime),
      };
      if (fd.endTime) payload.endTime = dateAndTimeToISO(base, fd.endTime);
      if (fd.stage) payload.stage = fd.stage;
      if (fd.description) payload.description = fd.description;

      if (editingItem?.id) {
        const res = await api.patch(`/api/events/rundown/${editingItem.id}`, payload);
        setRundowns(ps => ps.map(r => r.id === editingItem.id ? res.data[0] : r));
      } else {
        const res = await api.post(`/api/events/${eventId}/rundown`, payload);
        setRundowns(ps => [...ps, res.data[0]]);
      }

      setShowForm(false);
      setEditingItem(null);
      onUpdate?.();
      toast.showToast('success', 'Rundown berhasil disimpan');
    } catch (e: any) {
      toast.showToast('error', getApiError(e).error);
    } finally {
      setLoading(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus rundown ini?')) return;
    try {
      await api.delete(`/api/events/rundown/${id}`);
      setRundowns(ps => ps.filter(r => r.id !== id));
      onUpdate?.();
      toast.showToast('success', 'Rundown berhasil dihapus');
    } catch (e) {
      toast.showToast('error', getApiError(e).error);
    }
  };

  // Group by dayIndex
  const grouped = rundowns.reduce((acc: Record<number, RundownItem[]>, r) => {
    if (!r) return acc;
    const day = r.dayIndex ?? 1;
    (acc[day] ||= []).push(r);
    return acc;
  }, {} as Record<number, RundownItem[]>);

  const days = Object.entries(grouped).sort((a, b) => Number(a[0]) - Number(b[0]));

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Calendar className="w-5 h-5 text-emerald-600" />
            Rundown Event
          </h2>
          <p className="text-sm text-slate-500 mt-1">Kelola jadwal dan sesi acara per hari</p>
        </div>
        <Button onClick={() => { setEditingItem(null); setShowForm(true); }}>
          <Plus className="w-4 h-4 mr-2" />
          Tambah Sesi
        </Button>
      </div>

      {/* Empty state with example */}
      {days.length === 0 ? (
        <EmptyExample onAdd={() => { setEditingItem(null); setShowForm(true); }} />
      ) : (
        <div className="space-y-8">
          {days.map(([dayIndex, sessions]) => (
            <DayCard
              key={dayIndex}
              dayNumber={Number(dayIndex)}
              dayDate={calculateDayDate(eventStartDate, Number(dayIndex))}
              sessions={sessions}
              onEdit={s => { setEditingItem(s); setShowForm(true); }}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Add/Edit Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingItem ? 'Edit Sesi' : 'Tambah Sesi Baru'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingItem(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <RundownFormInline
              item={editingItem}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingItem(null); }}
              loading={loading}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Helper: calculate date for day N based on event start date
function calculateDayDate(startDate: Date | null, dayIndex: number): Date | null {
  if (!startDate) return null;
  const d = new Date(startDate);
  d.setDate(d.getDate() + (dayIndex - 1));
  return d;
}

// Empty state with professional example
function EmptyExample({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-white">Contoh Format Rundown</h3>
        <p className="text-sm text-slate-500 mt-1">Salin dan sesuaikan dengan kebutuhan event Anda</p>
      </div>
      <div className="p-6 overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-200 dark:border-slate-700">
              <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-200 w-32">Waktu</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-200">Acara</th>
              <th className="text-left py-3 px-4 font-semibold text-slate-700 dark:text-slate-200 w-40">Stage</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-700">
            <tr><td className="py-3 px-4 text-slate-600">10:00 - 10:30</td><td className="px-4">Gate Open & Registrasi</td><td className="px-4 text-slate-500">Entrance Area</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">10:30 - 11:00</td><td className="px-4">Opening Ceremony</td><td className="px-4 text-slate-500">Main Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">11:00 - 12:00</td><td className="px-4">Indie Band Performance</td><td className="px-4 text-slate-500">Main Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">12:00 - 13:00</td><td className="px-4">Break / Food Time</td><td className="px-4 text-slate-500">Food Area</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">13:00 - 14:00</td><td className="px-4">Talkshow Music Industry</td><td className="px-4 text-slate-500">Hall A</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">14:00 - 15:00</td><td className="px-4">DJ Session</td><td className="px-4 text-slate-500">EDM Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">15:00 - 16:00</td><td className="px-4">Guest Star Local Artist</td><td className="px-4 text-slate-500">Main Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">16:00 - 17:00</td><td className="px-4">Dance Competition</td><td className="px-4 text-slate-500">Community Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">17:00 - 18:30</td><td className="px-4">Break / Maghrib / Dinner</td><td className="px-4 text-slate-500">All Area</td></tr>
            <tr><td className="py-3 px-4 text-slate-600 font-medium">18:30 - 20:00</td><td className="px-4 font-medium">Headliner Artist #1</td><td className="px-4 text-slate-500">Main Stage</td></tr>
            <tr><td className="py-3 px-4 text-slate-600">20:00 - 21:00</td><td className="px-4">Closing Day 1</td><td className="px-4 text-slate-500">Main Stage</td></tr>
          </tbody>
        </table>
      </div>
      <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700 flex items-center justify-between">
        <p className="text-sm text-slate-500">
          Setiap event bisa memiliki <strong>1 atau lebih hari</strong>. Atur "Hari" di form untuk menempatkan sesi di hari yang tepat.
        </p>
        <Button onClick={onAdd}>
          <Plus className="w-4 h-4 mr-2" />
          Tambah Sesi Pertama
        </Button>
      </div>
    </div>
  );
}

// Day card component
function DayCard({
  dayNumber,
  dayDate,
  sessions,
  onEdit,
  onDelete,
}: {
  dayNumber: number;
  dayDate: Date | null;
  sessions: RundownItem[];
  onEdit: (s: RundownItem) => void;
  onDelete: (id: string) => void;
}) {
  const dayLabel = dayDate ? formatDayLabel(dayDate) : `Hari ${dayNumber}`;

  return (
    <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
      <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="text-lg font-bold text-slate-900 dark:text-white flex items-center gap-2">
          <Calendar className="w-5 h-5 text-emerald-600" />
          {dayLabel}
        </h3>
      </div>
      <div className="p-4">
        <div className="space-y-2">
          {sessions
            .filter((s): s is RundownItem => s && 'id' in s)
            .sort((a, b) => a.orderIndex - b.orderIndex)
            .map((session) => (
              <div
                key={session.id}
                className="group flex items-center gap-4 p-4 rounded-xl border border-slate-200 dark:border-slate-700 hover:border-emerald-500 dark:hover:border-emerald-500 transition-colors"
              >
                {/* Time column */}
                <div className="w-32 flex-shrink-0">
                  <div className="flex items-center gap-2 text-sm font-mono text-slate-900 dark:text-white">
                    <Clock className="w-4 h-4 text-slate-400" />
                    <span>{isoToTime(session.startTime)}</span>
                    {session.endTime && <span className="text-slate-400">– {isoToTime(session.endTime)}</span>}
                  </div>
                </div>

                {/* Title & description */}
                <div className="flex-1 min-w-0">
                  <h4 className="font-medium text-slate-900 dark:text-white truncate">{session.title}</h4>
                  {session.description && (
                    <p className="text-sm text-slate-500 truncate mt-0.5">{session.description}</p>
                  )}
                </div>

                {/* Stage badge */}
                {session.stage && (
                  <div className="flex-shrink-0">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200">
                      {session.stage}
                    </span>
                  </div>
                )}

                {/* Actions */}
                <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                  <Button size="sm" variant="outline" onClick={() => onEdit(session)}>
                    <Edit className="w-4 h-4" />
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => session.id && onDelete(session.id)}>
                    <Trash2 className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            ))}
        </div>
      </div>
    </div>
  );
}

// Inline add/edit form (modal content)
interface RundownFormInlineProps {
  item: RundownItem | null;
  onSave: (fd: { title: string; startTime: string; endTime?: string; stage?: string; description?: string; sessionType: string; orderIndex: number; dayIndex: number }) => void;
  onCancel: () => void;
  loading: boolean;
}

function RundownFormInline({ item, onSave, onCancel, loading }: RundownFormInlineProps) {
  const [form, setForm] = useState<{
    title: string; startTime: string; endTime: string;
    stage: string; description: string; sessionType: string;
    orderIndex: number; dayIndex: number;
  }>({
    title: '', startTime: '', endTime: '', stage: '', description: '',
    sessionType: 'performance', orderIndex: 0, dayIndex: 1,
  });

  useEffect(() => {
    if (item) {
      setForm({
        title: item.title || '',
        startTime: isoToTime(item.startTime),
        endTime: isoToTime(item.endTime || ''),
        stage: item.stage || '',
        description: item.description || '',
        sessionType: item.sessionType || 'performance',
        orderIndex: item.orderIndex ?? 0,
        dayIndex: item.dayIndex ?? 1,
      });
    } else {
      setForm({ title: '', startTime: '', endTime: '', stage: '', description: '', sessionType: 'performance', orderIndex: 0, dayIndex: 1 });
    }
  }, [item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-5">
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Judul Sesi *</label>
        <Input
          value={form.title}
          onChange={e => setForm({ ...form, title: e.target.value })}
          placeholder="Misal: Opening Ceremony"
          required
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Waktu Mulai *</label>
          <Input
            type="time"
            value={form.startTime}
            onChange={e => setForm({ ...form, startTime: e.target.value })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Waktu Selesai (Opsional)</label>
          <Input
            type="time"
            value={form.endTime}
            onChange={e => setForm({ ...form, endTime: e.target.value })}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Stage (Opsional)</label>
          <Input
            value={form.stage}
            onChange={e => setForm({ ...form, stage: e.target.value })}
            placeholder="Misal: Main Stage"
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Tipe Sesi *</label>
          <Input
            value={form.sessionType}
            onChange={e => setForm({ ...form, sessionType: e.target.value })}
            placeholder="Misal: performance, talkshow"
            required
          />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Hari *</label>
          <Input
            type="number"
            min={1}
            value={form.dayIndex}
            onChange={e => setForm({ ...form, dayIndex: parseInt(e.target.value) || 1 })}
            required
          />
          <p className="text-xs text-slate-500 mt-1">Hari keberapa dalam event ini?</p>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Urutan Sesi *</label>
          <Input
            type="number"
            min={0}
            value={form.orderIndex}
            onChange={e => setForm({ ...form, orderIndex: parseInt(e.target.value) || 0 })}
            required
          />
          <p className="text-xs text-slate-500 mt-1">Urutan tampil (0,1,2,...)</p>
        </div>
      </div>

      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Deskripsi (Opsional)</label>
        <Textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Deskripsi singkat tentang sesi ini..."
          rows={3}
        />
      </div>

      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {item ? 'Update Sesi' : 'Tambah Sesi'}
        </Button>
      </div>
    </form>
  );
}

// Format: "Sabtu, 24 Mei 2026"
function formatDayLabel(date: Date): string {
  const days = ['Minggu', 'Senin', 'Selasa', 'Rabu', 'Kamis', 'Jumat', 'Sabtu'];
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Agu', 'Sep', 'Okt', 'Nov', 'Des'];
  return `${days[date.getDay()]}, ${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

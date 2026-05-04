'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { Loader2, Save, Users, Plus, Trash2, Edit, X, Image as ImageIcon, UploadCloud } from 'lucide-react';

interface SocialLinks {
  instagram?: string;
  spotify?: string;
  youtube?: string;
  [key: string]: string | undefined;
}

type LineupRole = 'HEADLINER' | 'SUPPORTING' | 'DJ' | 'HOST' | 'SPECIAL_GUEST' | 'OPENING_ACT';

interface LineupItem {
  id?: string;
  artistName: string;
  role: LineupRole;
  photoUrl?: string;
  description?: string;
  orderIndex: number;
  dayIndex?: number;
  socialLinks?: SocialLinks;
}

const LINEUP_ROLES: { value: LineupRole; label: string }[] = [
  { value: 'HEADLINER', label: 'Headliner' },
  { value: 'SUPPORTING', label: 'Supporting' },
  { value: 'DJ', label: 'DJ' },
  { value: 'HOST', label: 'Host / MC' },
  { value: 'SPECIAL_GUEST', label: 'Special Guest' },
  { value: 'OPENING_ACT', label: 'Opening Act' },
];

interface LineupFormProps {
  initialData: LineupItem[];
  eventId: string;
  onUpdate?: () => void;
}

export function LineupForm({ initialData, eventId, onUpdate }: LineupFormProps) {
  const [lineups, setLineups] = useState<LineupItem[]>(initialData);
  const [saving, setSaving] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [editingItem, setEditingItem] = useState<LineupItem | null>(null);
  const toast = useToast();

  // Initialize data
  useEffect(() => {
    const valid = (initialData || []).filter((l): l is LineupItem => l && 'id' in l);
    setLineups(valid);
  }, [initialData]);

  const handleSave = async (fd: {
    artistName: string; role: LineupRole; dayIndex: number; orderIndex: number;
    description?: string; photoUrl?: string; socialLinks?: SocialLinks;
  }) => {
    setSaving(true);
    try {
      const payload = { ...fd };
      if (!payload.photoUrl) delete payload.photoUrl;
      if (!payload.description) delete payload.description;
      if (!payload.socialLinks || Object.keys(payload.socialLinks).length === 0) delete payload.socialLinks;

      if (editingItem?.id) {
        const res = await api.patch(`/api/events/${eventId}/lineup/${editingItem.id}`, payload);
        setLineups(prev => prev.map(l => l.id === editingItem.id ? { ...l, ...res.data.data } : l));
      } else {
        // Create lineup first
        const res = await api.post(`/api/events/${eventId}/lineup`, payload);
        const newLineup = res.data.data;
        setLineups(prev => [...prev, newLineup]);

        // If there's a local photo URL (from file input), upload it
        if (fd.photoUrl && fd.photoUrl.startsWith('data:')) {
          try {
            // Convert data URL to file
            const response = await fetch(fd.photoUrl);
            const blob = await response.blob();
            const file = new File([blob], 'photo.webp', { type: 'image/webp' });

            const formData = new FormData();
            formData.append('file', file);

            await api.post(`/api/events/${eventId}/lineup/${newLineup.id}/photo`, formData, {
              headers: { 'Content-Type': 'multipart/form-data' }
            });

            // Refresh lineup data
            const updatedRes = await api.get(`/api/events/${eventId}/lineup`);
            const updatedLineups = updatedRes.data.data;
            setLineups(updatedLineups);
          } catch (uploadErr) {
            console.error('Photo upload failed:', uploadErr);
            // Continue even if photo upload fails
          }
        }
      }

      setShowForm(false);
      setEditingItem(null);
      onUpdate?.();
      toast.showToast('success', 'Lineup berhasil disimpan');
    } catch (e: any) {
      toast.showToast('error', getApiError(e).error);
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Yakin ingin menghapus artis ini?')) return;
    try {
      await api.delete(`/api/events/${eventId}/lineup/${id}`);
      setLineups(prev => prev.filter(l => l.id !== id));
      onUpdate?.();
      toast.showToast('success', 'Artis berhasil dihapus');
    } catch (e) {
      toast.showToast('error', getApiError(e).error);
    }
  };

  // Sort by orderIndex
  const sortedLineups = [...lineups].sort((a, b) => a.orderIndex - b.orderIndex);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-slate-900 dark:text-white flex items-center gap-2">
            <Users className="w-5 h-5 text-purple-600" />
            Lineup Artis
          </h2>
          <p className="text-sm text-slate-500 mt-1">Kelola daftar artis dan penampil event</p>
        </div>
        <Button onClick={() => {
          const nextIndex = sortedLineups.length;
          setEditingItem({
            artistName: '',
            role: 'HEADLINER',
            dayIndex: 1,
            orderIndex: nextIndex,
            photoUrl: '',
            description: '',
            socialLinks: {},
          });
          setShowForm(true);
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Tambah Artis
        </Button>
      </div>

      {/* Empty state with example */}
      {sortedLineups.length === 0 ? (
        <EmptyExample onAdd={() => { setEditingItem(null); setShowForm(true); }} />
      ) : (
        <div className="space-y-3">
          {sortedLineups.map((artist) => (
            <ArtistCard
              key={artist.id}
              artist={artist}
              onEdit={() => { setEditingItem(artist); setShowForm(true); }}
              onDelete={() => artist.id && handleDelete(artist.id)}
            />
          ))}
        </div>
      )}

      {/* Save button when there are items */}
      {sortedLineups.length > 0 && (
        <div className="flex justify-end pt-4 border-t border-slate-200 dark:border-slate-700">
          <Button onClick={async () => {
            setSaving(true);
            try {
              // Save lineup order
              await Promise.all(sortedLineups.map((lineup, index) =>
                api.patch(`/api/events/${eventId}/lineup/${lineup.id}`, {
                  orderIndex: index,
                  dayIndex: lineup.dayIndex || 0
                })
              ));
              toast.showToast('success', 'Lineup berhasil disimpan');
            } catch (err) {
              toast.showToast('error', getApiError(err).error);
            } finally {
              setSaving(false);
            }
          }} disabled={saving} className="bg-purple-600 hover:bg-purple-700">
            {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
            Simpan Lineup
          </Button>
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-slate-800 rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto">
            <div className="p-6 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900 dark:text-white">
                {editingItem ? 'Edit Artis' : 'Tambah Artis Baru'}
              </h3>
              <button onClick={() => { setShowForm(false); setEditingItem(null); }} className="p-2 hover:bg-slate-100 dark:hover:bg-slate-700 rounded-lg">
                <X className="w-5 h-5 text-slate-500" />
              </button>
            </div>
            <LineupFormInline
              item={editingItem}
              onSave={handleSave}
              onCancel={() => { setShowForm(false); setEditingItem(null); }}
              loading={saving}
              eventId={eventId}
            />
          </div>
        </div>
      )}
    </div>
  );
}

// Empty state with professional example
function EmptyExample({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-2xl overflow-hidden">
      <div className="bg-slate-50 dark:bg-slate-900 px-6 py-4 border-b border-slate-200 dark:border-slate-700">
        <h3 className="font-semibold text-slate-900 dark:text-white">Contoh Format Lineup</h3>
        <p className="text-sm text-slate-500 mt-1">Tambahkan artis dengan role yang sesuai</p>
      </div>
      <div className="p-6">
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
          <div className="font-semibold text-slate-700 dark:text-slate-300">Nama Artis</div>
          <div className="font-semibold text-slate-700 dark:text-slate-300">Role</div>
          <div className="font-semibold text-slate-700 dark:text-slate-300"> Hari</div>
        </div>
        <div className="mt-3 space-y-2">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="text-slate-600 dark:text-slate-300">The Beatles</div>
            <div className="text-slate-500">HEADLINER</div>
            <div className="text-slate-500">Hari 1</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="text-slate-600 dark:text-slate-300">Local Band</div>
            <div className="text-slate-500">SUPPORTING</div>
            <div className="text-slate-500">Hari 1</div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 py-2 border-b border-slate-100 dark:border-slate-700">
            <div className="text-slate-600 dark:text-slate-300">DJ Arman</div>
            <div className="text-slate-500">DJ</div>
            <div className="text-slate-500">Hari 2</div>
          </div>
        </div>
      </div>
       <div className="px-6 py-4 bg-slate-50 dark:bg-slate-900 border-t border-slate-200 dark:border-slate-700">
       <Button onClick={() => {
          onAdd();
        }}>
          <Plus className="w-4 h-4 mr-2" />
          Tambah Artis Pertama
        </Button>
      </div>
    </div>
  );
}

// Artist card component for list view
function ArtistCard({ artist, onEdit, onDelete }: {
  artist: LineupItem;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const roleLabel = LINEUP_ROLES.find(r => r.value === artist.role)?.label || artist.role;

  return (
    <div className="group flex items-center gap-4 p-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl hover:border-purple-500 dark:hover:border-purple-500 transition-all">
      {/* Photo */}
      <div className="w-16 h-16 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600">
        {artist.photoUrl ? (
          <img src={artist.photoUrl} alt={artist.artistName} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-slate-400">
            <ImageIcon className="w-6 h-6" />
          </div>
        )}
      </div>

      {/* Info */}
      <div className="flex-1 min-w-0">
        <h4 className="font-semibold text-slate-900 dark:text-white truncate">{artist.artistName}</h4>
        <div className="flex items-center gap-3 mt-1 text-sm text-slate-500">
          <span className="px-2 py-0.5 rounded-full bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 text-xs font-medium">
            {roleLabel}
          </span>
          {artist.dayIndex && <span>Hari {artist.dayIndex}</span>}
        </div>
      </div>

      {/* Actions */}
      <div className="flex items-center gap-2 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
        <Button size="sm" variant="outline" onClick={onEdit}>
          <Edit className="w-4 h-4" />
        </Button>
        <Button size="sm" variant="outline" onClick={onDelete}>
          <Trash2 className="w-4 h-4" />
        </Button>
      </div>
    </div>
  );
}

// Inline form modal
interface LineupFormInlineProps {
  item: LineupItem | null;
  onSave: (fd: { artistName: string; role: LineupRole; dayIndex: number; orderIndex: number; description?: string; photoUrl?: string; socialLinks?: SocialLinks }) => void;
  onCancel: () => void;
  loading: boolean;
  eventId: string;
}

function LineupFormInline({ item, onSave, onCancel, loading, eventId }: LineupFormInlineProps) {
  const toast = useToast();
  const [form, setForm] = useState<{
    artistName: string;
    role: LineupRole;
    dayIndex: number;
    orderIndex: number;
    description: string;
    photoUrl: string;
    socialLinks: SocialLinks;
  }>({
    artistName: '', role: 'HEADLINER', dayIndex: 1, orderIndex: 0,
    description: '', photoUrl: '', socialLinks: {},
  });

  useEffect(() => {
    if (item) {
      setForm({
        artistName: item.artistName || '',
        role: item.role || 'HEADLINER',
        dayIndex: item.dayIndex ?? 1,
        orderIndex: item.orderIndex ?? 0,
        description: item.description || '',
        photoUrl: item.photoUrl || '',
        socialLinks: item.socialLinks || {},
      });
    } else {
      setForm({ artistName: '', role: 'HEADLINER', dayIndex: 1, orderIndex: 0, description: '', photoUrl: '', socialLinks: {} });
    }
  }, [item]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave(form);
  };

  const handlePhotoChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.showToast('error', 'Hanya file gambar yang diizinkan');
      return;
    }

    // For new items (no id yet), just set local preview
    if (!item?.id) {
      const reader = new FileReader();
      reader.onloadend = () => {
        setForm({ ...form, photoUrl: reader.result as string });
      };
      reader.readAsDataURL(file);
      return;
    }

    // For existing items, upload to server
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await api.post(`/api/events/${eventId}/lineup/${item.id}/photo`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setForm({ ...form, photoUrl: res.data.url });
      toast.showToast('success', 'Foto berhasil diupload');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="p-6 space-y-6">
      {/* Artist Name */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Nama Artis / Grup *
        </label>
        <Input
          value={form.artistName}
          onChange={e => setForm({ ...form, artistName: e.target.value })}
          placeholder="Misal: The Beatles, DJ Arman, dll"
          required
        />
      </div>

      {/* Role, Day, Order */}
      <div className="grid grid-cols-3 gap-4">
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Role *</label>
          <select
            value={form.role}
            onChange={e => setForm({ ...form, role: e.target.value as LineupRole })}
            className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-purple-500"
          >
            {LINEUP_ROLES.map(r => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Hari *
          </label>
          <Input
            type="number"
            min={1}
            value={form.dayIndex}
            onChange={e => setForm({ ...form, dayIndex: parseInt(e.target.value) || 1 })}
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
            Urutan *
          </label>
          <Input
            type="number"
            min={0}
            value={form.orderIndex}
            onChange={e => setForm({ ...form, orderIndex: parseInt(e.target.value) || 0 })}
            required
          />
        </div>
      </div>

      {/* Photo Upload */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Foto Artis</label>
        <div className="flex items-center gap-4">
          <div className="w-20 h-20 flex-shrink-0 rounded-xl overflow-hidden bg-slate-100 dark:bg-slate-700 border-2 border-slate-200 dark:border-slate-600">
            {form.photoUrl ? (
              <img src={form.photoUrl} alt="Preview" className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-slate-400">
                <ImageIcon className="w-8 h-8" />
              </div>
            )}
          </div>
          <div className="flex-1">
            <label className="inline-flex items-center px-4 py-2 bg-slate-100 dark:bg-slate-700 hover:bg-slate-200 dark:hover:bg-slate-600 rounded-lg cursor-pointer text-sm font-medium text-slate-700 dark:text-slate-200">
              <UploadCloud className="w-4 h-4 mr-2" />
              Upload Foto
              <input type="file" accept="image/*" className="hidden" onChange={handlePhotoChange} />
            </label>
            <p className="text-xs text-slate-500 mt-2">Format: JPG, PNG, WebP</p>
          </div>
        </div>
      </div>

      {/* Description */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">
          Deskripsi (Opsional)
        </label>
        <Textarea
          value={form.description}
          onChange={e => setForm({ ...form, description: e.target.value })}
          placeholder="Ceritakan tentang artis, genre musik, atau highlights penampilan..."
          rows={3}
        />
      </div>

      {/* Social Links */}
      <div>
        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-200 mb-3">
          Media Sosial (Opsional)
        </label>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            placeholder="Instagram URL"
            value={form.socialLinks?.instagram || ''}
            onChange={e => setForm({ ...form, socialLinks: { ...form.socialLinks, instagram: e.target.value } })}
          />
          <Input
            placeholder="Spotify URL"
            value={form.socialLinks?.spotify || ''}
            onChange={e => setForm({ ...form, socialLinks: { ...form.socialLinks, spotify: e.target.value } })}
          />
          <Input
            placeholder="YouTube URL"
            value={form.socialLinks?.youtube || ''}
            onChange={e => setForm({ ...form, socialLinks: { ...form.socialLinks, youtube: e.target.value } })}
          />
        </div>
      </div>

      {/* Actions */}
      <div className="flex justify-end gap-3 pt-4 border-t border-slate-200 dark:border-slate-700">
        <Button type="button" variant="outline" onClick={onCancel}>
          Batal
        </Button>
        <Button type="submit" disabled={loading}>
          {loading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {item ? 'Update Artis' : 'Tambah Artis'}
        </Button>
      </div>
    </form>
  );
}

'use client';

import { useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import {
  Loader2, Save, UploadCloud, Trash2, Info, ArrowUp, ArrowDown, Video
} from 'lucide-react';

interface EventInfoFormProps {
  initialData: any;
  eventId: string;
  onUpdate?: () => Promise<void> | void;
}

export function EventInfoForm({ initialData, eventId, onUpdate }: EventInfoFormProps) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const [localPreviews, setLocalPreviews] = useState<Record<string, string>>({});
  const [videoUrl, setVideoUrl] = useState('');
  const toast = useToast();
  const isPublished = data?.status === 'PUBLISHED';

  const refreshEventData = async () => {
    const res = await api.get(`/api/events/${eventId}/full`);
    setData(res.data);
  };

  const handleSave = async () => {
    if (saving) return;
    if (!data.title?.trim()) {
      toast.showToast('error', 'Judul event wajib diisi');
      return;
    }
    if (!data.shortDescription?.trim()) {
      toast.showToast('error', 'Deskripsi singkat wajib diisi');
      return;
    }
    if (!data.city?.trim()) {
      toast.showToast('error', 'Kota wajib diisi');
      return;
    }
    if (data.startDate && data.endDate && new Date(data.startDate) >= new Date(data.endDate)) {
      toast.showToast('error', 'Tanggal selesai harus setelah tanggal mulai');
      return;
    }

    setSaving(true);
    try {
      await api.patch(`/api/events/${eventId}`, {
        title: data.title?.trim(),
        shortDescription: data.shortDescription?.trim(),
        description: data.description?.trim(),
        startDate: data.startDate,
        endDate: data.endDate,
        city: data.city?.trim(),
        province: data.province?.trim(),
        posterUrl: data.posterUrl,
      });
      if (onUpdate) await onUpdate();
      toast.showToast('success', 'Informasi event berhasil diperbarui');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, type: 'poster' | 'gallery') => {
    const previewUrl = URL.createObjectURL(file);
    setLocalPreviews(prev => ({ ...prev, [type]: previewUrl }));
    const formData = new FormData();
    formData.append('file', file);
    try {
      toast.showToast('info', `Mengunggah ${type}...`);
      const res = await api.post(`/api/events/${eventId}/upload/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      if (type === 'gallery') {
        await refreshEventData();
      } else {
        setData({ ...data, [`${type}Url`]: res.data.url });
      }
      toast.showToast('success', `${type} berhasil diperbarui`);
    } catch (err: any) {
      toast.showToast('error', `Gagal mengunggah ${type}`);
    } finally {
      URL.revokeObjectURL(previewUrl);
      setLocalPreviews(prev => {
        const next = { ...prev };
        delete next[type];
        return next;
      });
    }
  };

  const uploadGalleryImages = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    for (const file of Array.from(files)) {
      await uploadImage(file, 'gallery');
    }
  };

  const reorderGallery = async (imageId: string, direction: 'up' | 'down') => {
    const gallery = ((data.images || []).filter((img: any) => !img.eventId || img.eventId === eventId) as any[])
      .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
    const currentIndex = gallery.findIndex((img) => img.id === imageId);
    if (currentIndex === -1) return;
    const targetIndex = direction === 'up' ? currentIndex - 1 : currentIndex + 1;
    if (targetIndex < 0 || targetIndex >= gallery.length) return;

    const swapped = [...gallery];
    [swapped[currentIndex], swapped[targetIndex]] = [swapped[targetIndex], swapped[currentIndex]];

    const items = swapped.map((img, idx) => ({ id: img.id, orderIndex: idx + 1 }));
    try {
      await api.patch(`/api/events/${eventId}/gallery/reorder`, { items });
      await refreshEventData();
      toast.showToast('success', 'Urutan gallery diperbarui');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const deleteGalleryItem = async (imageId: string) => {
    try {
      await api.delete(`/api/events/${eventId}/gallery/${imageId}`);
      await refreshEventData();
      toast.showToast('success', 'Media gallery dihapus');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const addVideoToGallery = async () => {
    const trimmed = videoUrl.trim();
    if (!trimmed) return;
    try {
      await api.post(`/api/events/${eventId}/gallery/video-url`, { videoUrl: trimmed });
      setVideoUrl('');
      await refreshEventData();
      toast.showToast('success', 'Video ditambahkan ke carousel');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

    return (
    <div className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div>
        <h2 className="text-2xl font-bold flex items-center">
          <div className="p-2 bg-blue-500 rounded-lg mr-3">
            <Info className="w-5 h-5 text-white" />
          </div>
          Informasi Event
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Konfigurasi detail dan informasi dasar event</p>
      </div>

      {/* SECTION 1: BASIC INFO */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50/60 dark:bg-slate-900/30 p-6">
        <div className="mb-5 flex items-center justify-between">
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">Informasi Dasar</h3>
          <span className="text-[11px] uppercase tracking-wide text-slate-500">Wajib Diisi</span>
        </div>
        <div className="space-y-5">
          <div className="space-y-4">
            <Input
              label="Judul Event"
              value={data.title}
              onChange={e => setData({ ...data, title: e.target.value })}
              placeholder="Contoh: Konser Malam Minggu"
            />
            <Input
              label="Deskripsi Singkat"
              value={data.shortDescription}
              onChange={e => setData({ ...data, shortDescription: e.target.value })}
              placeholder="Deskripsi yang muncul di kartu event..."
            />
            <Textarea
              label="Deskripsi Lengkap"
              value={data.description}
              onChange={e => setData({ ...data, description: e.target.value })}
              placeholder="Detail lengkap acara..."
              rows={6}
            />
          </div>
          <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Waktu Event</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Tanggal Mulai"
                type="datetime-local"
                value={data.startDate?.slice(0, 16)}
                onChange={e => setData({ ...data, startDate: e.target.value })}
                disabled={isPublished}
              />
              <Input
                label="Tanggal Selesai"
                type="datetime-local"
                value={data.endDate?.slice(0, 16)}
                onChange={e => setData({ ...data, endDate: e.target.value })}
                disabled={isPublished}
              />
            </div>
          </div>
          <div className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Lokasi Event</p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Input
                label="Kota"
                value={data.city}
                onChange={e => setData({ ...data, city: e.target.value })}
              />
              <Input
                label="Provinsi"
                value={data.province}
                onChange={e => setData({ ...data, province: e.target.value })}
              />
            </div>
          </div>
          <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-4 py-3 text-xs text-slate-500 leading-relaxed">
            Pastikan waktu mulai dan selesai sudah final. Untuk event yang sudah publish, perubahan tanggal dibatasi.
          </div>
        </div>
      </div>

      {isPublished && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2">
          Event sudah publish. Perubahan tanggal dibatasi untuk menjaga konsistensi data publik.
        </p>
      )}

      {/* SECTION 2: MEDIA */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
          Media & Gambar Event
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {['poster'].map((type) => (
            <div key={type} className="space-y-2">
              <label className="text-sm font-bold capitalize">{type}</label>
              <div className="relative group">
                {(localPreviews[type] || (data as any)[`${type}Url`]) ? (
                  <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-square bg-slate-100">
                    <img src={localPreviews[type] || (data as any)[`${type}Url`]} alt={type} className="w-full h-full object-cover" />
                    <button 
                      onClick={() => setData({ ...data, [`${type}Url`]: '' })}
                      className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ) : (
                  <label className="flex flex-col items-center justify-center aspect-[3/4] md:aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-all bg-slate-50 dark:bg-slate-900/50">
                    <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], type as 'poster')} />
                    <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                    <span className="text-xs text-slate-500 font-medium text-center px-4">Unggah {type}</span>
                  </label>
                )}
              </div>
            </div>
          ))}
          <div className="md:col-span-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Banner dan Thumbnail Disembunyikan</p>
            <p className="text-xs text-slate-500 mt-1">
              Untuk UI/UX yang lebih fokus, pengelolaan media utama di halaman ini menggunakan poster + gallery carousel.
            </p>
          </div>
        </div>
        <div className="mt-8 border-t border-slate-200 dark:border-slate-700 pt-6">
          <div className="flex items-center justify-between mb-3">
            <label className="text-sm font-bold">Gallery Event (Multiple)</label>
            <label className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 cursor-pointer text-sm hover:bg-slate-50 dark:hover:bg-slate-800">
              <UploadCloud className="w-4 h-4" />
              Upload Gallery
              <input
                type="file"
                className="hidden"
                accept="image/*,video/mp4,video/webm,video/ogg"
                multiple
                onChange={e => uploadGalleryImages(e.target.files)}
              />
            </label>
          </div>
          <div className="mb-4 rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-3">
            <p className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-2 flex items-center gap-2">
              <Video className="w-4 h-4" /> Tambah Video ke Carousel (URL)
            </p>
            <div className="flex gap-2">
              <Input
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://cdn.example.com/video.mp4"
              />
              <Button type="button" variant="outline" onClick={addVideoToGallery}>Tambah</Button>
            </div>
          </div>
          {(data.images || []).filter((img: any) => !img.eventId || img.eventId === eventId).length > 0 ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {(data.images || [])
                .filter((img: any) => !img.eventId || img.eventId === eventId)
                .map((img: any, idx: number) => (
                <div key={img.id || idx} className="rounded-lg overflow-hidden border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900">
                  {/(\.mp4|\.webm|\.ogg)(\?|$)/i.test(img.imageUrl) ? (
                    <video src={img.imageUrl} className="w-full h-28 object-cover bg-black" muted controls />
                  ) : (
                    <img src={img.imageUrl} alt={`gallery-${idx + 1}`} className="w-full h-28 object-cover" />
                  )}
                  <div className="flex items-center justify-end gap-1 p-1.5 bg-white/80 dark:bg-slate-800/80">
                    <Button type="button" size="sm" variant="outline" onClick={() => reorderGallery(img.id, 'up')}>
                      <ArrowUp className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" onClick={() => reorderGallery(img.id, 'down')}>
                      <ArrowDown className="w-3.5 h-3.5" />
                    </Button>
                    <Button type="button" size="sm" variant="outline" className="text-red-600" onClick={() => deleteGalleryItem(img.id)}>
                      <Trash2 className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <p className="text-sm text-slate-500">Belum ada gallery image.</p>
          )}
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 -mx-8 -mb-8 px-8 py-6 rounded-b-2xl">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-blue-500 to-indigo-600 hover:from-blue-600 hover:to-indigo-700 disabled:from-slate-400 disabled:to-slate-500 shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-2.5"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Menyimpan...' : 'Simpan Informasi'}
        </Button>
      </div>
    </div>
  );
}

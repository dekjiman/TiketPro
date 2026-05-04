'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import {
  ArrowLeft, Loader2, Plus, Info, Image as ImageIcon,
  Calendar, MapPin
} from 'lucide-react';

export default function CreateEventPage() {
  const [data, setData] = useState({
    title: '',
    shortDescription: '',
    description: '',
    posterUrl: '',
    bannerUrl: '',
    thumbnailUrl: '',
    startDate: '',
    endDate: '',
    city: '',
    province: '',
  });
  
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [files, setFiles] = useState<{
    poster: File | null;
    gallery: File[];
  }>({
    poster: null,
    gallery: [],
  });
  const [previews, setPreviews] = useState<{
    poster: string;
    gallery: string[];
  }>({
    poster: '',
    gallery: [],
  });
  const router = useRouter();
  const toast = useToast();

  // VALIDATION & AUTO LOGIC
  const isDateInvalid = useMemo(() => {
    if (!data.startDate || !data.endDate) return false;
    return new Date(data.endDate) <= new Date(data.startDate);
  }, [data.startDate, data.endDate]);

  const isMultiDay = useMemo(() => {
    if (!data.startDate || !data.endDate) return false;
    return new Date(data.startDate).toDateString() !== new Date(data.endDate).toDateString();
  }, [data.startDate, data.endDate]);

  const handleFileChange = (type: 'poster', file: File | null) => {
    setFiles((prev) => ({ ...prev, [type]: file }));
    if (file) {
      const localUrl = URL.createObjectURL(file);
      setPreviews((prev) => ({ ...prev, [type]: localUrl }));
    } else {
      setPreviews((prev) => ({ ...prev, [type]: '' }));
    }
  };

  const uploadEventImage = async (eventId: string, type: 'poster', file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/api/events/${eventId}/upload/${type}`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.url as string | undefined;
  };

  const uploadGalleryImage = async (eventId: string, file: File) => {
    const formData = new FormData();
    formData.append('file', file);
    const res = await api.post(`/api/events/${eventId}/upload/gallery`, formData, {
      headers: { 'Content-Type': 'multipart/form-data' },
    });
    return res.data?.url as string | undefined;
  };

  const handleCreate = async () => {
    if (saving) return;
    // Client Side Validation
    if (data.title.trim().length < 3) {
      setError('Judul minimal 3 karakter');
      return;
    }
    if (!data.city.trim()) {
      setError('Kota wajib diisi');
      return;
    }
    if (!data.startDate || !data.endDate) {
      setError('Tanggal mulai dan selesai wajib diisi');
      return;
    }
    if (isDateInvalid) {
      setError('Tanggal selesai harus setelah tanggal mulai');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const startIso = new Date(data.startDate).toISOString();
      const endIso = new Date(data.endDate).toISOString();
      const payload = {
        ...data,
        title: data.title.trim(),
        shortDescription: data.shortDescription.trim(),
        description: data.description.trim(),
        startDate: startIso,
        endDate: endIso,
        city: data.city.trim(),
        province: data.province.trim(),
      };
      const res = await api.post('/api/events', payload);
      const newEvent = res.data;

      const uploadTasks: Array<Promise<any>> = [];
      if (files.poster) uploadTasks.push(uploadEventImage(newEvent.id, 'poster', files.poster));
      if (files.gallery.length > 0) {
        for (const image of files.gallery) {
          uploadTasks.push(uploadGalleryImage(newEvent.id, image));
        }
      }
      if (uploadTasks.length > 0) {
        try {
          await Promise.all(uploadTasks);
        } catch {
          toast.showToast('warning', 'Event dibuat, tetapi sebagian gambar gagal di-upload. Silakan cek di halaman Manage.');
        }
      }

      toast.showToast('success', 'Event berhasil dibuat!');
      router.push(`/eo/events/${newEvent.id}/manage`);
    } catch (err: any) {
      setError(getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto py-12 px-4">
      <Link href="/eo/events" className="mb-8 inline-flex items-center text-slate-500 hover:text-emerald-600 transition-colors font-medium">
        <ArrowLeft className="w-4 h-4 mr-2" /> Kembali ke Daftar
      </Link>

      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-extrabold text-slate-900 dark:text-white">Buat Event Baru</h1>
          <p className="text-slate-500 mt-1">Lengkapi informasi dasar untuk mendaftarkan event Anda.</p>
        </div>
        {isMultiDay && (
          <div className="px-3 py-1 bg-emerald-100 text-emerald-700 text-xs font-bold rounded-full uppercase tracking-wider">
            Multi-Day Event
          </div>
        )}
      </div>

      <div className="space-y-8">
        {/* SECTION 1: BASIC INFO */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center mr-3">
              <Info className="w-4 h-4 text-indigo-600" />
            </div>
            <h2 className="text-xl font-bold">1. Informasi Dasar</h2>
          </div>
          <div className="space-y-5">
            <Input 
              label="Judul Event *" 
              placeholder="Contoh: Java Jazz Festival 2024"
              value={data.title} 
              onChange={e => setData({ ...data, title: e.target.value })} 
            />
            <Input 
              label="Deskripsi Singkat" 
              placeholder="Ringkasan pendek event..."
              value={data.shortDescription} 
              onChange={e => setData({ ...data, shortDescription: e.target.value })} 
            />
            <Textarea 
              label="Deskripsi Lengkap" 
              placeholder="Jelaskan detail event Anda di sini..."
              value={data.description} 
              onChange={e => setData({ ...data, description: e.target.value })} 
              rows={5}
            />
          </div>
        </div>

        {/* SECTION 2: MEDIA */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-pink-100 dark:bg-pink-900/30 flex items-center justify-center mr-3">
              <ImageIcon className="w-4 h-4 text-pink-600" />
            </div>
            <h2 className="text-xl font-bold">2. Media</h2>
          </div>
          <div className="mb-5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/40 p-4">
            <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">Upload Poster</p>
            <p className="text-xs text-slate-500 mt-1">
              Fokus halaman ini hanya poster agar flow lebih jelas. Banner dan thumbnail bisa Anda atur di halaman Manage Event.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold">Poster</label>
              <label className="block">
                <input
                  type="file"
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => handleFileChange('poster', e.target.files?.[0] || null)}
                />
                <div className="cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-colors">
                  Pilih file poster
                </div>
              </label>
              <Input
                placeholder="https://.../poster.jpg"
                value={data.posterUrl}
                onChange={e => setData({ ...data, posterUrl: e.target.value.trim() })}
              />
              {previews.poster || data.posterUrl ? (
                <div className="relative rounded-xl overflow-hidden aspect-[3/4] bg-slate-100">
                  <img src={previews.poster || data.posterUrl} alt="poster" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div className="flex items-center justify-center aspect-[3/4] rounded-xl border border-dashed border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-xs text-slate-500">
                  Poster belum dipilih
                </div>
              )}
            </div>
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50/70 dark:bg-slate-900/40 p-4">
              <p className="text-sm font-semibold text-slate-700 dark:text-slate-200 mb-2">Gallery Carousel (Multiple Image)</p>
              <label className="block">
                <input
                  type="file"
                  multiple
                  accept="image/*"
                  className="hidden"
                  onChange={(e) => {
                    const selected = Array.from(e.target.files || []);
                    setFiles((prev) => ({ ...prev, gallery: selected }));
                    setPreviews((prev) => ({
                      ...prev,
                      gallery: selected.map((file) => URL.createObjectURL(file)),
                    }));
                  }}
                />
                <div className="cursor-pointer rounded-lg border border-dashed border-slate-300 dark:border-slate-600 px-3 py-2 text-xs text-slate-600 dark:text-slate-300 hover:border-emerald-500 hover:text-emerald-600 transition-colors">
                  Pilih multiple image gallery
                </div>
              </label>
              <p className="text-xs text-slate-500 mt-2">
                {files.gallery.length > 0
                  ? `${files.gallery.length} gambar dipilih untuk carousel`
                  : 'Belum ada gambar gallery dipilih'}
              </p>
              {files.gallery.length > 0 && (
                <div className="mt-3 grid grid-cols-3 gap-2">
                  {files.gallery.slice(0, 6).map((file, idx) => (
                    <div key={`${file.name}-${idx}`} className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
                      <div className="aspect-square bg-slate-100 dark:bg-slate-900">
                        <img
                          src={previews.gallery[idx]}
                          alt={file.name}
                          className="w-full h-full object-cover"
                        />
                      </div>
                      <div className="px-2 py-1 text-[10px] truncate">
                        {file.name}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>

        {/* SECTION 3: EVENT TIME */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-amber-100 dark:bg-amber-900/30 flex items-center justify-center mr-3">
              <Calendar className="w-4 h-4 text-amber-600" />
            </div>
            <h2 className="text-xl font-bold">3. Waktu Event</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input 
              label="Tanggal & Waktu Mulai *" 
              type="datetime-local" 
              value={data.startDate} 
              onChange={e => setData({ ...data, startDate: e.target.value })} 
            />
            <div className="space-y-1">
              <Input 
                label="Tanggal & Waktu Selesai *" 
                type="datetime-local" 
                value={data.endDate} 
                onChange={e => setData({ ...data, endDate: e.target.value })} 
                className={isDateInvalid ? 'border-red-500 focus:ring-red-500' : ''}
              />
              {isDateInvalid && <p className="text-[10px] text-red-500 font-bold uppercase tracking-tight">Harus setelah tanggal mulai</p>}
            </div>
          </div>
        </div>

        {/* SECTION 4: LOCATION */}
        <div className="bg-white dark:bg-slate-800 p-8 rounded-2xl border border-slate-200 dark:border-slate-700 shadow-sm">
          <div className="flex items-center mb-6">
            <div className="w-8 h-8 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center mr-3">
              <MapPin className="w-4 h-4 text-emerald-600" />
            </div>
            <h2 className="text-xl font-bold">4. Lokasi</h2>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <Input 
              label="Kota *" 
              placeholder="Contoh: Jakarta"
              value={data.city} 
              onChange={e => setData({ ...data, city: e.target.value })} 
            />
            <Input 
              label="Provinsi" 
              placeholder="Contoh: DKI Jakarta"
              value={data.province} 
              onChange={e => setData({ ...data, province: e.target.value })} 
            />
          </div>
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 rounded-xl border border-red-100 dark:border-red-900/30 font-bold text-center">
            {error}
          </div>
        )}

        <Button 
          className="w-full h-14 text-xl font-bold rounded-2xl shadow-xl shadow-emerald-600/20 active:scale-[0.98] transition-all" 
          onClick={handleCreate} 
          disabled={saving || isDateInvalid}
        >
          {saving ? (
            <Loader2 className="w-6 h-6 mr-2 animate-spin" />
          ) : (
            <Plus className="w-6 h-6 mr-2" />
          )}
          Buat Event Sekarang
        </Button>
      </div>
    </div>
  );
}

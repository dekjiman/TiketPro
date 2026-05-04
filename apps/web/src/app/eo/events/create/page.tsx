'use client';

import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { 
  ArrowLeft, Loader2, Plus, Info, Image as ImageIcon, 
  Calendar, MapPin, UploadCloud, Trash2 
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
  const router = useRouter();
  const toast = useToast();

  // VALIDATION & AUTO LOGIC
  const isDateInvalid = useMemo(() => {
    if (!data.startDate || !data.endDate) return false;
    return new Date(data.endDate) < new Date(data.startDate);
  }, [data.startDate, data.endDate]);

  const isMultiDay = useMemo(() => {
    if (!data.startDate || !data.endDate) return false;
    return new Date(data.startDate).toDateString() !== new Date(data.endDate).toDateString();
  }, [data.startDate, data.endDate]);

  const handleCreate = async () => {
    // Client Side Validation
    if (data.title.length < 3) {
      setError('Judul minimal 3 karakter');
      return;
    }
    if (!data.city) {
      setError('Kota wajib diisi');
      return;
    }
    if (isDateInvalid) {
      setError('Tanggal selesai tidak boleh sebelum tanggal mulai');
      return;
    }

    setSaving(true);
    setError('');
    try {
      const res = await api.post('/api/events', data);
      const newEvent = res.data;
      toast.showToast('success', 'Event berhasil dibuat!');
      router.push(`/eo/events/${newEvent.id}/manage`);
    } catch (err: any) {
      setError(getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, type: 'poster' | 'banner' | 'thumbnail') => {
    toast.showToast('info', `Simulasi upload ${type}...`);
    const reader = new FileReader();
    reader.onloadend = () => {
      setData({ ...data, [`${type}Url`]: reader.result as string });
    };
    reader.readAsDataURL(file);
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
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {['poster', 'banner', 'thumbnail'].map((type) => (
              <div key={type} className="space-y-2">
                <label className="text-sm font-bold capitalize">{type}</label>
                <div className="relative group">
                  {(data as any)[`${type}Url`] ? (
                    <div className="relative rounded-xl overflow-hidden aspect-[3/4] md:aspect-square bg-slate-100">
                      <img src={(data as any)[`${type}Url`]} alt={type} className="w-full h-full object-cover" />
                      <button 
                        onClick={() => setData({ ...data, [`${type}Url`]: '' })}
                        className="absolute top-2 right-2 p-1.5 bg-red-500 text-white rounded-full opacity-0 group-hover:opacity-100 transition-opacity shadow-lg"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ) : (
                    <label className="flex flex-col items-center justify-center aspect-[3/4] md:aspect-square rounded-xl border-2 border-dashed border-slate-300 dark:border-slate-700 hover:border-emerald-500 cursor-pointer transition-all bg-slate-50 dark:bg-slate-900/50">
                      <input type="file" className="hidden" accept="image/*" onChange={e => e.target.files?.[0] && uploadImage(e.target.files[0], type as any)} />
                      <UploadCloud className="w-8 h-8 text-slate-400 mb-2" />
                      <span className="text-xs text-slate-500 font-medium text-center px-4">Pilih Gambar</span>
                    </label>
                  )}
                </div>
              </div>
            ))}
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
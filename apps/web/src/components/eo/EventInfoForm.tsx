'use client';

import { useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import {
  Loader2, Save, Image as ImageIcon, UploadCloud, Trash2, Info
} from 'lucide-react';

interface EventInfoFormProps {
  initialData: any;
  eventId: string;
}

export function EventInfoForm({ initialData, eventId }: EventInfoFormProps) {
  const [data, setData] = useState(initialData);
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  const handleSave = async () => {
    setSaving(true);
    try {
      await api.patch(`/api/events/${eventId}`, {
        title: data.title,
        shortDescription: data.shortDescription,
        description: data.description,
        startDate: data.startDate,
        endDate: data.endDate,
        city: data.city,
        province: data.province,
        posterUrl: data.posterUrl,
        bannerUrl: data.bannerUrl,
        thumbnailUrl: data.thumbnailUrl,
      });
      toast.showToast('success', 'Informasi event berhasil diperbarui');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const uploadImage = async (file: File, type: 'poster' | 'banner' | 'thumbnail') => {
    const formData = new FormData();
    formData.append('file', file);
    try {
      toast.showToast('info', `Mengunggah ${type}...`);
      const res = await api.post(`/api/events/${eventId}/upload/${type}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });
      setData({ ...data, [`${type}Url`]: res.data.url });
      toast.showToast('success', `${type} berhasil diperbarui`);
    } catch (err: any) {
      toast.showToast('error', `Gagal mengunggah ${type}`);
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
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          Informasi Dasar
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input
              label="Judul Event"
              value={data.title}
              onChange={e => setData({ ...data, title: e.target.value })}
              placeholder="Contoh: Konser Malam Minggu"
              className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
            />
            <Input
              label="Deskripsi Singkat"
              value={data.shortDescription}
              onChange={e => setData({ ...data, shortDescription: e.target.value })}
              placeholder="Deskripsi yang muncul di kartu event..."
              className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
            />
            <Textarea
              label="Deskripsi Lengkap"
              value={data.description}
              onChange={e => setData({ ...data, description: e.target.value })}
              placeholder="Detail lengkap acara..."
              rows={6}
              className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
            />
          </div>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Tanggal Mulai"
                type="datetime-local"
                value={data.startDate?.slice(0, 16)}
                onChange={e => setData({ ...data, startDate: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
              />
              <Input
                label="Tanggal Selesai"
                type="datetime-local"
                value={data.endDate?.slice(0, 16)}
                onChange={e => setData({ ...data, endDate: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Kota"
                value={data.city}
                onChange={e => setData({ ...data, city: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
              />
              <Input
                label="Provinsi"
                value={data.province}
                onChange={e => setData({ ...data, province: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500/20"
              />
            </div>
          </div>
        </div>
      </div>

      {/* SECTION 2: MEDIA */}
      <div className="bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
          Media & Gambar Event
        </h3>
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
                    <span className="text-xs text-slate-500 font-medium text-center px-4">Unggah {type}</span>
                  </label>
                )}
              </div>
            </div>
          ))}
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

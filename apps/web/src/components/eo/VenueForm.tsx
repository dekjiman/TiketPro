'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, Textarea, useToast } from '@/components/ui';
import { Loader2, Save, MapPin } from 'lucide-react';

interface VenueFormProps {
  initialData: any;
  eventId: string;
  onUpdate?: () => void;
}

export function VenueForm({ initialData, eventId, onUpdate }: VenueFormProps) {
  const [data, setData] = useState(initialData || {
    name: '',
    address: '',
    city: '',
    province: '',
    capacity: 0,
    latitude: '',
    longitude: '',
    mapUrl: '',
    facilities: '',
    notes: '',
    timezone: 'Asia/Jakarta'
  });
  const [saving, setSaving] = useState(false);
  const toast = useToast();

  useEffect(() => {
    if (initialData) {
      setData(initialData);
    }
  }, [initialData]);

  const handleSave = async () => {
    if (!data.name?.trim()) {
      toast.showToast('error', 'Nama venue harus diisi');
      return;
    }
    if (!data.address?.trim()) {
      toast.showToast('error', 'Alamat harus diisi');
      return;
    }
    if (!data.city?.trim()) {
      toast.showToast('error', 'Kota harus diisi');
      return;
    }
    if (data.capacity < 0) {
      toast.showToast('error', 'Kapasitas harus >= 0');
      return;
    }
    if (!data.timezone?.trim()) {
      toast.showToast('error', 'Timezone harus diisi');
      return;
    }
    if ((data.latitude && !data.longitude) || (!data.latitude && data.longitude)) {
      toast.showToast('error', 'Latitude dan longitude harus diisi bersama atau dikosongkan bersama');
      return;
    }
    setSaving(true);
    try {
      const payload: any = {
        name: data.name.trim(),
        address: data.address.trim(),
        city: data.city.trim(),
        capacity: data.capacity || 0,
        timezone: data.timezone.trim(),
      };
      if (data.province?.trim()) payload.province = data.province.trim();
      if (data.latitude) payload.latitude = parseFloat(data.latitude);
      if (data.longitude) payload.longitude = parseFloat(data.longitude);
      if (data.mapUrl?.trim()) payload.mapUrl = data.mapUrl.trim();
      if (data.facilities?.trim()) payload.facilities = data.facilities.trim();
      if (data.notes?.trim()) payload.notes = data.notes.trim();
      await api.patch(`/api/events/${eventId}/venue`, payload);
      onUpdate?.();
      toast.showToast('success', 'Data lokasi berhasil diperbarui');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

    return (
    <div className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div>
        <h2 className="text-2xl font-bold flex items-center">
          <div className="p-2 bg-emerald-500 rounded-lg mr-3">
            <MapPin className="w-5 h-5 text-white" />
          </div>
          Lokasi & Venue
        </h2>
        <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Konfigurasi detail lokasi dan tempat acara</p>
      </div>

      {/* Venue Info Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-emerald-500 rounded-full"></div>
          Informasi Venue
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="space-y-4">
            <Input
              label="Nama Venue"
              value={data.name || ''}
              onChange={e => setData({ ...data, name: e.target.value })}
              placeholder="Contoh: Stadion Utama Gelora Bung Karno"
              className="border-slate-300 dark:border-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
            />
            <Textarea
              label="Alamat Lengkap"
              value={data.address || ''}
              onChange={e => setData({ ...data, address: e.target.value })}
              placeholder="Jl. Pintu Satu Senayan..."
              rows={4}
              className="border-slate-300 dark:border-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
            />
            <div className="grid grid-cols-2 gap-4">
              <Input
                label="Kota"
                value={data.city || ''}
                onChange={e => setData({ ...data, city: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
              />
              <Input
                label="Provinsi"
                value={data.province || ''}
                onChange={e => setData({ ...data, province: e.target.value })}
                className="border-slate-300 dark:border-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
              />
            </div>
            <Input
              label="Kapasitas Penonton"
              type="number"
              value={data.capacity || 0}
              onChange={e => setData({ ...data, capacity: parseInt(e.target.value) || 0 })}
              className="border-slate-300 dark:border-slate-600 focus:border-emerald-500 focus:ring-emerald-500"
            />
          </div>
        </div>
      </div>

      {/* Location Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
          Lokasi & Koordinat (Opsional)
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Input
            label="Latitude"
            type="number"
            step="any"
            value={data.latitude || ''}
            onChange={e => setData({ ...data, latitude: e.target.value })}
            placeholder="-6.2088"
            className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
          />
          <Input
            label="Longitude"
            type="number"
            step="any"
            value={data.longitude || ''}
            onChange={e => setData({ ...data, longitude: e.target.value })}
            placeholder="106.8456"
            className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
          />
          <Input
            label="URL Google Maps"
            value={data.mapUrl || ''}
            onChange={e => setData({ ...data, mapUrl: e.target.value })}
            placeholder="https://goo.gl/maps/..."
            className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
          />
        </div>
      </div>

      {/* Additional Section */}
      <div className="bg-white dark:bg-slate-800 rounded-xl p-6 border border-slate-200 dark:border-slate-700 shadow-sm">
        <h3 className="text-lg font-semibold text-slate-800 dark:text-slate-200 mb-6 flex items-center gap-2">
          <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
          Detail Tambahan
        </h3>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Textarea
            label="Fasilitas"
            value={data.facilities || ''}
            onChange={e => setData({ ...data, facilities: e.target.value })}
            placeholder="Parkir, Toilet, Restoran, dll..."
            rows={3}
            className="border-slate-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500"
          />
          <div className="space-y-4">
            <Input
              label="Timezone"
              value={data.timezone || ''}
              onChange={e => setData({ ...data, timezone: e.target.value })}
              placeholder="Asia/Jakarta"
              className="border-slate-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500"
            />
            <Textarea
              label="Catatan Lokasi"
              value={data.notes || ''}
              onChange={e => setData({ ...data, notes: e.target.value })}
              placeholder="Informasi parkir, pintu masuk, dll..."
              rows={3}
              className="border-slate-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500"
            />
          </div>
        </div>
      </div>

      <div className="flex justify-end pt-6 border-t border-slate-200/60 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/50 -mx-8 -mb-8 px-8 py-6 rounded-b-2xl">
        <Button
          onClick={handleSave}
          disabled={saving}
          className="bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 disabled:from-slate-400 disabled:to-slate-500 shadow-lg hover:shadow-xl transition-all duration-200 px-6 py-2.5"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Menyimpan...' : 'Simpan Lokasi'}
        </Button>
      </div>
    </div>
  );
}

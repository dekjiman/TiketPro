'use client';

import { useState } from 'react';
import { Button, Input, Textarea } from '@/components/ui';
import type { PrizePayload } from '@/hooks/useLotterySettings';
import { api, getApiError } from '@/lib/api';
import { toast } from 'sonner';

interface PrizeFormProps {
  eventId: string;
  initialValue?: PrizePayload | null;
  defaultOrder?: number;
  onSubmit: (payload: Omit<PrizePayload, 'id'>) => Promise<void> | void;
  onCancel?: () => void;
}

export function PrizeForm({ eventId, initialValue, defaultOrder = 1, onSubmit, onCancel }: PrizeFormProps) {
  const [name, setName] = useState(initialValue?.name || '');
  const [description, setDescription] = useState(initialValue?.description || '');
  const [imageUrl, setImageUrl] = useState(initialValue?.imageUrl || '');
  const [totalWinner, setTotalWinner] = useState(initialValue?.totalWinner || 1);
  const [remainingWinner, setRemainingWinner] = useState(initialValue?.remainingWinner ?? initialValue?.totalWinner ?? 1);
  const [order, setOrder] = useState(initialValue?.order || defaultOrder);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const imagePreviewUrl = (() => {
    const v = (imageUrl || '').trim();
    if (!v) return '';
    if (v.startsWith('/')) return v;
    if (v.startsWith('http://') || v.startsWith('https://')) return v;
    return '';
  })();

  const uploadImage = async (file: File) => {
    if (!file || !file.type.startsWith('image/')) {
      toast.error('File harus berupa gambar');
      return;
    }
    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/prizes/upload-image?eventId=${encodeURIComponent(eventId)}`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      const uploadedUrl = res.data?.url || '';
      if (uploadedUrl) {
        setImageUrl(uploadedUrl);
        toast.success('Gambar berhasil diupload (WebP)');
      }
    } catch (err) {
      toast.error(getApiError(err).error || 'Gagal upload gambar');
    } finally {
      setUploading(false);
    }
  };

  return (
    <form
      className="space-y-3"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || totalWinner <= 0 || order <= 0) return;
        setSaving(true);
        try {
          await onSubmit({
            eventId,
            name: name.trim(),
            description: description.trim() || null,
            imageUrl: imageUrl.trim() || null,
            totalWinner,
            remainingWinner,
            order,
          });
        } finally {
          setSaving(false);
        }
      }}
    >
      <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Nama hadiah" />
      <Textarea value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Deskripsi hadiah (opsional)" />
      <div className="space-y-2">
        <Input value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Image URL (opsional)" />
        <div className="flex items-center gap-2">
          <label className="inline-flex items-center gap-2 rounded-md border px-3 py-2 text-sm cursor-pointer">
            <span>{uploading ? 'Uploading...' : 'Upload Image'}</span>
            <input
              type="file"
              className="hidden"
              accept="image/*"
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadImage(file);
              }}
            />
          </label>
          <span className="text-xs text-slate-500">Auto convert ke .webp</span>
        </div>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Total Winner</label>
          <Input type="number" min={1} value={totalWinner} onChange={(e) => setTotalWinner(Number(e.target.value || 0))} placeholder="Total Winner" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Remaining Winner</label>
          <Input type="number" min={0} value={remainingWinner} onChange={(e) => setRemainingWinner(Number(e.target.value || 0))} placeholder="Remaining" />
        </div>
        <div className="space-y-1">
          <label className="text-xs font-medium text-slate-600">Order</label>
          <Input type="number" min={1} value={order} onChange={(e) => setOrder(Number(e.target.value || 1))} placeholder="Order" />
        </div>
      </div>
      {imagePreviewUrl ? (
        <div className="w-full overflow-hidden rounded-lg border bg-slate-50">
          <div className="aspect-[16/9] w-full">
            <img src={imagePreviewUrl} alt="Prize preview" className="h-full w-full object-cover" />
          </div>
        </div>
      ) : imageUrl ? (
        <p className="text-xs text-amber-600">Image URL belum valid. Gunakan URL absolut atau path `/public/uploads/...`</p>
      ) : null}
      <div className="flex gap-2">
        <Button type="submit" disabled={saving} className="flex-1">
          {saving ? 'Saving...' : initialValue ? 'Update Prize' : 'Add Prize'}
        </Button>
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
      </div>
    </form>
  );
}

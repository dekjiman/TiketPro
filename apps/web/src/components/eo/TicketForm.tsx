'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { Edit, Loader2, Plus, Ticket, Trash2, UploadCloud, X } from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  quota: number;
  sold?: number;
  description?: string;
  saleStartAt?: string;
  saleEndAt?: string;
  maxPerOrder?: number;
  maxPerAccount?: number;
  templateType?: string;
  templateUrl?: string;
  isInternal?: boolean;
  colorHex?: string;
  orderIndex?: number;
}

interface TicketFormProps {
  initialData: TicketCategory[];
  eventId: string;
  onUpdate?: () => void;
}

const defaultCategory = (orderIndex: number): TicketCategory => ({
  id: `temp-${Date.now()}`,
  name: '',
  price: 0,
  quota: 0,
  sold: 0,
  description: '',
  saleStartAt: '',
  saleEndAt: '',
  maxPerOrder: 4,
  maxPerAccount: 10,
  templateType: 'system',
  templateUrl: '',
  isInternal: false,
  colorHex: '#2563eb',
  orderIndex,
});

export function TicketForm({ initialData, eventId, onUpdate }: TicketFormProps) {
  const [categories, setCategories] = useState<TicketCategory[]>(
    initialData?.map((c, i) => ({ ...c, orderIndex: c.orderIndex ?? i })) || []
  );
  const [saving, setSaving] = useState(false);
  const [uploadingTemplate, setUploadingTemplate] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'public' | 'internal'>('all');
  const [pendingDeleteIndex, setPendingDeleteIndex] = useState<number | null>(null);

  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editorMode, setEditorMode] = useState<'add' | 'edit'>('add');
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [draft, setDraft] = useState<TicketCategory>(defaultCategory(0));

  const toast = useToast();

  useEffect(() => {
    const mapped = initialData?.map((c, i) => ({ ...c, orderIndex: c.orderIndex ?? i })) || [];
    setCategories(mapped);
    setIsEditorOpen(false);
    setEditingIndex(null);
  }, [initialData]);

  const totals = useMemo(() => {
    const quota = categories.reduce((sum, c) => sum + (c.quota || 0), 0);
    const sold = categories.reduce((sum, c) => sum + (c.sold || 0), 0);
    const omzet = categories.reduce((sum, c) => sum + (c.price || 0) * (c.quota || 0), 0);
    return { quota, sold, omzet };
  }, [categories]);

  const formatRupiah = (value: number) => `Rp ${new Intl.NumberFormat('id-ID').format(value || 0)}`;

  const openAddModal = () => {
    setEditorMode('add');
    setEditingIndex(null);
    setDraft(defaultCategory(categories.length));
    setIsEditorOpen(true);
  };

  const openEditModal = (index: number) => {
    setEditorMode('edit');
    setEditingIndex(index);
    setDraft({ ...categories[index] });
    setIsEditorOpen(true);
  };

  const closeEditor = () => {
    setIsEditorOpen(false);
    setEditingIndex(null);
  };

  const toIsoOrEmpty = (value?: string) => {
    if (!value) return undefined;
    const parsed = new Date(value);
    return Number.isNaN(parsed.getTime()) ? undefined : parsed.toISOString();
  };

  const applyDraft = async () => {
    if (!draft.name.trim()) {
      toast.showToast('error', 'Nama tiket wajib diisi');
      return;
    }
    setSaving(true);
    try {
      const payload = {
        name: draft.name.trim(),
        description: draft.description || undefined,
        price: Number(draft.price || 0),
        quota: Number(draft.quota || 0),
        saleStartAt: toIsoOrEmpty(draft.saleStartAt),
        saleEndAt: toIsoOrEmpty(draft.saleEndAt),
        maxPerOrder: Number(draft.maxPerOrder || 4),
        maxPerAccount: Number(draft.maxPerAccount || 10),
        templateType: draft.templateType || 'system',
        templateUrl: draft.templateUrl || undefined,
        isInternal: !!draft.isInternal,
        colorHex: draft.colorHex || undefined,
        orderIndex: draft.orderIndex ?? (categories.length + 1),
      };

      if (editorMode === 'add') {
        await api.post(`/api/events/${eventId}/ticket-categories`, payload);
        toast.showToast('success', 'Kategori tiket berhasil ditambahkan');
      } else if (editingIndex !== null && draft.id && !String(draft.id).startsWith('temp-')) {
        await api.patch(`/api/events/${eventId}/ticket-categories/${draft.id}`, payload);
        toast.showToast('success', 'Kategori tiket berhasil diperbarui');
      }

      onUpdate?.();
      closeEditor();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const handleTemplateUpload = async (file: File) => {
    if (!file) return;
    const allowed = ['application/pdf', 'image/png', 'image/jpeg', 'image/webp'];
    if (!allowed.includes(file.type)) {
      toast.showToast('error', 'File harus PDF, PNG, JPG, atau WEBP');
      return;
    }

    setUploadingTemplate(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post(`/api/events/${eventId}/ticket-template/upload`, formData, {
        headers: { 'Content-Type': 'multipart/form-data' }
      });

      setDraft(prev => ({
        ...prev,
        templateType: 'custom',
        templateUrl: res.data.url || '',
      }));
      toast.showToast('success', 'Template tiket berhasil diupload');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setUploadingTemplate(false);
    }
  };

  const isImageTemplate = !!draft.templateUrl && /\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(draft.templateUrl);
  const showCustomTemplate = draft.templateType === 'custom';

  const filteredRows = categories
    .map((cat, index) => ({ cat, index }))
    .filter(({ cat }) => {
      const matchName = (cat.name || '').toLowerCase().includes(searchTerm.toLowerCase());
      const matchStatus =
        statusFilter === 'all' ||
        (statusFilter === 'public' && !cat.isInternal) ||
        (statusFilter === 'internal' && !!cat.isInternal);
      return matchName && matchStatus;
    });

  return (
    <div className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <h2 className="text-2xl font-bold text-slate-900 dark:text-white flex items-center gap-3">
            <span className="p-2 bg-blue-600 rounded-lg">
              <Ticket className="w-5 h-5 text-white" />
            </span>
            Kategori Tiket
          </h2>
          <p className="text-sm text-slate-500 mt-1">Tabel kategori tiket dengan aksi edit/hapus</p>
        </div>
        <Button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white">
          <Plus className="w-4 h-4 mr-2" />
          Tambah Kategori
        </Button>
      </div>

      {categories.length > 0 && (
        <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
          <SummaryCard label="Kategori" value={String(categories.length)} />
          <SummaryCard label="Total Kuota" value={String(totals.quota)} />
          <SummaryCard label="Tiket Terjual" value={String(totals.sold)} />
          <SummaryCard label="Potensi Omzet" value={formatRupiah(totals.omzet)} />
        </div>
      )}

      {categories.length === 0 ? (
        <div className="text-center py-14 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50 dark:bg-slate-900/40">
          <Ticket className="w-8 h-8 text-slate-400 mx-auto mb-3" />
          <p className="text-slate-600 dark:text-slate-300 font-semibold">Belum ada kategori tiket</p>
          <p className="text-sm text-slate-500 mt-1 mb-4">Klik tombol tambah kategori untuk mulai</p>
          <Button onClick={openAddModal} className="bg-blue-600 hover:bg-blue-700 text-white">
            <Plus className="w-4 h-4 mr-2" />
            Buat Kategori Pertama
          </Button>
        </div>
      ) : (
        <div className="space-y-4 min-w-0">
          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <Input
              placeholder="Cari nama kategori tiket..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            <select
              value={statusFilter}
              onChange={e => setStatusFilter(e.target.value as 'all' | 'public' | 'internal')}
              className="h-10 min-w-[180px] rounded-lg border border-slate-300 bg-white px-3 text-sm dark:border-slate-600 dark:bg-slate-800"
            >
              <option value="all">Semua Status</option>
              <option value="public">Publik</option>
              <option value="internal">Internal</option>
            </select>
          </div>

          <div className="overflow-hidden rounded-xl border border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-900/40">
            <div className="overflow-x-auto">
              <table className="w-full text-xs">
                <thead className="bg-slate-50 dark:bg-slate-900/70">
                  <tr className="text-left text-slate-600 dark:text-slate-300">
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Nama</th>
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Harga</th>
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Kuota</th>
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Terjual</th>
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Status</th>
                    <th className="whitespace-nowrap px-2.5 py-2 font-semibold">Warna</th>
                    <th className="whitespace-nowrap px-2.5 py-2 text-right font-semibold">Aksi</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRows.map(({ cat, index }) => (
                    <tr key={cat.id || index} className="border-t border-slate-200/80 dark:border-slate-700">
                      <td className="px-2.5 py-2 font-medium text-slate-900 dark:text-slate-100">
                        <div className="max-w-[180px] truncate">{cat.name || <span className="text-slate-400">Belum diisi</span>}</div>
                      </td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-slate-700 dark:text-slate-300">{formatRupiah(cat.price || 0)}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-slate-700 dark:text-slate-300">{cat.quota || 0}</td>
                      <td className="whitespace-nowrap px-2.5 py-2 text-slate-700 dark:text-slate-300">{cat.sold || 0}</td>
                      <td className="px-2.5 py-2">
                        <span className={`inline-flex rounded-full px-1.5 py-0.5 text-[10px] font-semibold leading-4 ${
                          cat.isInternal
                            ? 'bg-amber-100 text-amber-800 dark:bg-amber-900/30 dark:text-amber-300'
                            : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300'
                        }`}>
                          {cat.isInternal ? 'Internal' : 'Publik'}
                        </span>
                      </td>
                      <td className="px-2.5 py-2">
                        <span
                          className="inline-block h-4 w-4 rounded border border-slate-300 dark:border-slate-600"
                          style={{ backgroundColor: cat.colorHex || '#2563eb' }}
                        />
                      </td>
                      <td className="px-2.5 py-2">
                        <div className="flex justify-end gap-1.5">
                          <Button size="sm" variant="outline" onClick={() => openEditModal(index)} className="h-7 px-2 sm:px-2.5">
                            <Edit className="h-3.5 w-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Edit</span>
                          </Button>
                          <Button
                            size="sm"
                            variant="outline"
                            className="h-7 px-2 text-red-600 border-red-300 hover:bg-red-50 dark:hover:bg-red-900/20 sm:px-2.5"
                            onClick={() => setPendingDeleteIndex(index)}
                          >
                            <Trash2 className="h-3.5 w-3.5 sm:mr-1" />
                            <span className="hidden sm:inline">Delete</span>
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                  {filteredRows.length === 0 && (
                    <tr>
                      <td colSpan={7} className="px-4 py-10 text-center text-slate-500">
                        Tidak ada data yang cocok dengan pencarian/filter.
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      <div className="pt-4 border-t border-slate-200 dark:border-slate-700">
        <p className="text-sm text-slate-500">
          {saving ? 'Menyimpan perubahan...' : `${categories.length} kategori tiket`}
        </p>
      </div>

      {isEditorOpen && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <div className="flex items-center justify-between gap-3">
              <h3 className="font-semibold text-slate-900 dark:text-white">
                {editorMode === 'add' ? 'Tambah Kategori Tiket' : `Edit Kategori: ${draft.name || '-'}`}
              </h3>
              <Button size="sm" variant="ghost" onClick={closeEditor}>
                <X className="w-4 h-4 mr-1" />
                Tutup
              </Button>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Input
                label="Nama Tiket"
                value={draft.name}
                onChange={e => setDraft(prev => ({ ...prev, name: e.target.value }))}
                placeholder="Contoh: Early Bird"
              />
              <Input
                label="Harga"
                type="number"
                min={0}
                value={draft.price ?? 0}
                onChange={e => setDraft(prev => ({ ...prev, price: parseInt(e.target.value, 10) || 0 }))}
              />
              <Input
                label="Kuota"
                type="number"
                min={0}
                value={draft.quota ?? 0}
                onChange={e => setDraft(prev => ({ ...prev, quota: parseInt(e.target.value, 10) || 0 }))}
              />
              <Input
                label="Waktu Mulai Penjualan"
                type="datetime-local"
                value={draft.saleStartAt ? draft.saleStartAt.slice(0, 16) : ''}
                onChange={e => setDraft(prev => ({ ...prev, saleStartAt: e.target.value }))}
              />
              <Input
                label="Waktu Selesai Penjualan"
                type="datetime-local"
                value={draft.saleEndAt ? draft.saleEndAt.slice(0, 16) : ''}
                onChange={e => setDraft(prev => ({ ...prev, saleEndAt: e.target.value }))}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Warna Tiket</label>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={draft.colorHex || '#2563eb'}
                    onChange={e => setDraft(prev => ({ ...prev, colorHex: e.target.value }))}
                    className="h-10 w-10 cursor-pointer rounded border border-slate-300 dark:border-slate-600"
                  />
                  <Input
                    value={draft.colorHex || ''}
                    onChange={e => setDraft(prev => ({ ...prev, colorHex: e.target.value }))}
                    placeholder="#2563eb"
                  />
                </div>
              </div>
              <Input
                label="Maks tiket / transaksi"
                type="number"
                min={1}
                value={draft.maxPerOrder ?? 4}
                onChange={e => setDraft(prev => ({ ...prev, maxPerOrder: parseInt(e.target.value, 10) || 1 }))}
              />
              <Input
                label="Maks tiket / akun"
                type="number"
                min={1}
                value={draft.maxPerAccount ?? 10}
                onChange={e => setDraft(prev => ({ ...prev, maxPerAccount: parseInt(e.target.value, 10) || 1 }))}
              />
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Tipe Template</label>
                <select
                  value={draft.templateType || 'system'}
                  onChange={e => {
                    const nextType = e.target.value;
                    setDraft(prev => ({
                      ...prev,
                      templateType: nextType,
                      templateUrl: nextType === 'custom' ? prev.templateUrl : '',
                    }));
                  }}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="system">System Default</option>
                  <option value="custom">Custom Template</option>
                </select>
              </div>
              <div className="space-y-1">
                <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Visibilitas</label>
                <select
                  value={draft.isInternal ? 'internal' : 'public'}
                  onChange={e => setDraft(prev => ({ ...prev, isInternal: e.target.value === 'internal' }))}
                  className="w-full h-10 px-3 rounded-lg border border-slate-300 bg-white text-sm dark:border-slate-600 dark:bg-slate-800"
                >
                  <option value="public">Public Sale</option>
                  <option value="internal">Internal Only</option>
                </select>
              </div>
            </div>

            {showCustomTemplate ? (
              <>
                <Input
                  label="Template URL"
                  value={draft.templateUrl || ''}
                  onChange={e => setDraft(prev => ({ ...prev, templateUrl: e.target.value }))}
                  placeholder="https://example.com/template.jpg"
                />
                <div className="space-y-1">
                  <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Upload Template</label>
                  <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 text-sm hover:bg-slate-50 dark:border-slate-600 dark:bg-slate-800 dark:hover:bg-slate-700">
                    {uploadingTemplate ? <Loader2 className="h-4 w-4 animate-spin" /> : <UploadCloud className="h-4 w-4" />}
                    {uploadingTemplate ? 'Uploading...' : 'Pilih File'}
                    <input
                      type="file"
                      accept=".pdf,image/png,image/jpeg,image/webp"
                      className="hidden"
                      disabled={uploadingTemplate}
                      onChange={e => {
                        const file = e.target.files?.[0];
                        if (file) handleTemplateUpload(file);
                        e.currentTarget.value = '';
                      }}
                    />
                  </label>
                  <p className="text-xs text-slate-500">Format: PDF, PNG, JPG, WEBP</p>
                </div>

                {draft.templateUrl && (
                  <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-4 dark:border-slate-700 dark:bg-slate-800">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Preview Template</p>
                      <a
                        href={draft.templateUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-semibold text-blue-600 hover:text-blue-700"
                      >
                        Lihat Template
                      </a>
                    </div>
                    {isImageTemplate ? (
                      <div className="max-w-md overflow-hidden rounded-lg border border-slate-200 dark:border-slate-700">
                        <img
                          src={draft.templateUrl}
                          alt="Preview template tiket"
                          className="h-auto w-full object-contain bg-slate-100 dark:bg-slate-900"
                        />
                      </div>
                    ) : (
                      <p className="text-xs text-slate-500">
                        File non-gambar terdeteksi. Klik <span className="font-semibold">Lihat Template</span> untuk membuka file.
                      </p>
                    )}
                  </div>
                )}
              </>
            ) : (
              <div className="rounded-lg border border-dashed border-slate-300 bg-white/70 p-3 text-sm text-slate-500 dark:border-slate-700 dark:bg-slate-800/70">
                Template custom disembunyikan karena kategori ini memakai system default.
              </div>
            )}

            <div className="space-y-1">
              <label className="text-sm font-medium text-slate-700 dark:text-slate-300">Deskripsi</label>
              <textarea
                rows={3}
                value={draft.description || ''}
                onChange={e => setDraft(prev => ({ ...prev, description: e.target.value }))}
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm dark:border-slate-600 dark:bg-slate-800"
                placeholder="Jelaskan detail kategori tiket ini..."
              />
            </div>

            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={closeEditor}>Batal</Button>
              <Button className="bg-blue-600 text-white hover:bg-blue-700" onClick={applyDraft} disabled={saving}>
                {editorMode === 'add' ? 'Tambah ke Tabel' : 'Update Data'}
              </Button>
            </div>
          </div>
        </div>
      )}

      {pendingDeleteIndex !== null && (
        <div className="fixed inset-0 z-50 bg-black/40 flex items-center justify-center p-4">
          <div className="w-full max-w-md rounded-xl bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 p-5 space-y-4">
            <h4 className="text-lg font-semibold text-slate-900 dark:text-white">Konfirmasi Hapus</h4>
            <p className="text-sm text-slate-600 dark:text-slate-300">
              Hapus kategori <span className="font-semibold">"{categories[pendingDeleteIndex]?.name || `Kategori #${pendingDeleteIndex + 1}`}"</span>? Tindakan ini tidak bisa dibatalkan.
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setPendingDeleteIndex(null)}>
                Batal
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={async () => {
                  const selected = categories[pendingDeleteIndex];
                  if (selected?.id && !String(selected.id).startsWith('temp-')) {
                    setSaving(true);
                    try {
                      await api.delete(`/api/events/${eventId}/ticket-categories/${selected.id}`);
                      toast.showToast('success', 'Kategori tiket berhasil dihapus');
                      onUpdate?.();
                    } catch (err: any) {
                      toast.showToast('error', getApiError(err).error);
                    } finally {
                      setSaving(false);
                    }
                  }
                  setPendingDeleteIndex(null);
                }}
                disabled={saving}
              >
                Ya, Hapus
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 bg-slate-50 dark:bg-slate-900">
      <p className="text-xs text-slate-500">{label}</p>
      <p className="text-xl font-bold text-slate-900 dark:text-white">{value}</p>
    </div>
  );
}

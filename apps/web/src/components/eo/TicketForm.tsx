'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { Loader2, Save, Ticket, Plus, Trash2, ChevronDown, ChevronUp } from 'lucide-react';

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

export function TicketForm({ initialData, eventId, onUpdate }: TicketFormProps) {
  const [categories, setCategories] = useState<TicketCategory[]>(
    initialData?.map((c, i) => ({ ...c, orderIndex: c.orderIndex ?? i })) || []
  );
  const [saving, setSaving] = useState(false);
  const [expandedIdx, setExpandedIdx] = useState<number | null>(null);
  const toast = useToast();

  useEffect(() => {
    const mapped = initialData?.map((c, i) => ({ ...c, orderIndex: c.orderIndex ?? i })) || [];
    setCategories(mapped);
  }, [initialData]);

  const addCategory = () => {
    setCategories([...categories, {
      id: `temp-${Date.now()}`,
      name: '',
      price: 0,
      quota: 0,
      sold: 0,
      description: '',
      maxPerOrder: 4,
      maxPerAccount: 10,
      templateType: 'system',
      isInternal: false,
      orderIndex: categories.length,
    }]);
  };

  const removeCategory = (index: number) => {
    setCategories(categories.filter((_, i) => i !== index));
  };

  const updateCategory = (index: number, field: keyof TicketCategory, value: any) => {
    setCategories(prev => prev.map((cat, i) =>
      i === index ? { ...cat, [field]: value } : cat
    ));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const data = categories.map((c, i) => ({ ...c, orderIndex: i }));
      await api.put(`/api/events/${eventId}/ticket-categories`, { categories: data });
      onUpdate?.();
      toast.showToast('success', 'Kategori tiket berhasil diperbarui');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-6 bg-white dark:bg-slate-800 p-6 rounded-xl border border-slate-200 dark:border-slate-700 shadow-sm">
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-bold flex items-center">
            <div className="p-2 bg-blue-500 rounded-lg mr-3">
              <Ticket className="w-5 h-5 text-white" />
            </div>
            Kategori Tiket
          </h2>
          <p className="text-slate-600 dark:text-slate-400 mt-1 text-sm">Kelola kategori tiket dan pengaturan penjualan</p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={addCategory}
          className="border-slate-300 dark:border-slate-600 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-all duration-200"
        >
          <Plus className="w-4 h-4 mr-2" />
          Tambah Kategori
        </Button>
      </div>

      <div className="space-y-6">
        {categories.length === 0 ? (
          <div className="text-center py-16 border-2 border-dashed border-slate-300 dark:border-slate-600 rounded-xl bg-slate-50/50 dark:bg-slate-800/50">
            <div className="p-4 bg-slate-200 dark:bg-slate-700 rounded-full w-fit mx-auto mb-4">
              <Ticket className="w-8 h-8 text-slate-400" />
            </div>
            <h3 className="text-lg font-semibold text-slate-700 dark:text-slate-300 mb-2">Belum Ada Kategori Tiket</h3>
            <p className="text-slate-500 dark:text-slate-400 mb-4">Buat kategori tiket pertama untuk memulai penjualan</p>
            <Button onClick={addCategory} className="bg-blue-500 hover:bg-blue-600 shadow-md hover:shadow-lg transition-all duration-200">
              <Plus className="w-4 h-4 mr-2" />
              Buat Kategori Pertama
            </Button>
          </div>
        ) : (
          categories.map((cat, index) => (
            <div key={cat.id || index} className="group border border-slate-200 dark:border-slate-700 rounded-xl overflow-hidden bg-white dark:bg-slate-800 shadow-sm hover:shadow-lg transition-all duration-300">
              {/* Collapsed header row */}
              <div className="flex items-center gap-4 p-6 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-600">
                <div className="flex-1 grid grid-cols-1 md:grid-cols-4 gap-4">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Nama Tiket</label>
                    <Input
                      placeholder="Contoh: Early Bird"
                      value={cat.name}
                      onChange={e => updateCategory(index, 'name', e.target.value)}
                      className="border-slate-300 dark:border-slate-600 focus:border-blue-500 focus:ring-blue-500"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Harga (Rp)</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={cat.price ?? 0}
                      onChange={e => updateCategory(index, 'price', parseInt(e.target.value) || 0)}
                      className="border-slate-300 dark:border-slate-600 focus:border-green-500 focus:ring-green-500/20"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Kuota</label>
                    <Input
                      type="number"
                      placeholder="0"
                      value={cat.quota ?? 0}
                      onChange={e => updateCategory(index, 'quota', parseInt(e.target.value) || 0)}
                      className="border-slate-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500/20"
                    />
                  </div>
                  <div className="flex items-end gap-3">
                    {/* Color swatch */}
                    <div className="flex flex-col items-center gap-1">
                      <label className="text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wide">Warna</label>
                      <input
                        type="color"
                        value={cat.colorHex || '#6366f1'}
                        onChange={e => updateCategory(index, 'colorHex', e.target.value)}
                        className="w-10 h-10 rounded-lg border-2 border-white dark:border-slate-600 shadow-sm cursor-pointer hover:scale-110 transition-transform"
                      />
                    </div>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setExpandedIdx(expandedIdx === index ? null : index)}
                        className={`hover:bg-slate-100 dark:hover:bg-slate-700 transition-all duration-200 ${expandedIdx === index ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600' : ''}`}
                      >
                        {expandedIdx === index ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="text-red-500 hover:text-red-700 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all duration-200"
                        onClick={() => removeCategory(index)}
                      >
                        <Trash2 className="w-4 h-4" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>

              {/* Expanded fields */}
              {expandedIdx === index && (
                <div className="p-6 bg-slate-50/50 dark:bg-slate-800/50 space-y-6 animate-in slide-in-from-top-2 duration-300">
                  {/* Basic */}
                  <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                    <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-3">
                      <span className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-blue-500 rounded-full"></div>
                        Deskripsi Tiket
                      </span>
                    </label>
                    <textarea
                      className="w-full px-4 py-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none transition-all duration-200"
                      placeholder="Jelaskan keuntungan dan detail tiket ini..."
                      rows={3}
                      value={cat.description || ''}
                      onChange={e => updateCategory(index, 'description', e.target.value)}
                    />
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Sales Period */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full"></div>
                        Periode Penjualan
                      </h4>
                      <div className="space-y-3">
                        <Input
                          label="Waktu Mulai Penjualan"
                          type="datetime-local"
                          value={cat.saleStartAt ? cat.saleStartAt.slice(0, 16) : ''}
                          onChange={e => updateCategory(index, 'saleStartAt', e.target.value)}
                          className="border-slate-300 dark:border-slate-600 focus:border-green-500 focus:ring-green-500/20"
                        />
                        <Input
                          label="Waktu Selesai Penjualan"
                          type="datetime-local"
                          value={cat.saleEndAt ? cat.saleEndAt.slice(0, 16) : ''}
                          onChange={e => updateCategory(index, 'saleEndAt', e.target.value)}
                          className="border-slate-300 dark:border-slate-600 focus:border-green-500 focus:ring-green-500/20"
                        />
                      </div>
                    </div>

                    {/* Limits */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-orange-500 rounded-full"></div>
                        Batasan Pembelian
                      </h4>
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          label="Max Per Order"
                          type="number"
                          min={1}
                          value={cat.maxPerOrder ?? 4}
                          onChange={e => updateCategory(index, 'maxPerOrder', parseInt(e.target.value) || 1)}
                          className="border-slate-300 dark:border-slate-600 focus:border-orange-500 focus:ring-orange-500/20"
                        />
                        <Input
                          label="Max Per Akun"
                          type="number"
                          min={1}
                          value={cat.maxPerAccount ?? 10}
                          onChange={e => updateCategory(index, 'maxPerAccount', parseInt(e.target.value) || 1)}
                          className="border-slate-300 dark:border-slate-600 focus:border-orange-500 focus:ring-orange-500/20"
                        />
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* Display */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-purple-500 rounded-full"></div>
                        Template & Tampilan
                      </h4>
                      <div className="space-y-3">
                        <div>
                          <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-2">Tipe Template</label>
                          <select
                            value={cat.templateType || 'system'}
                            onChange={e => updateCategory(index, 'templateType', e.target.value)}
                            className="w-full h-10 px-3 text-sm rounded-lg border border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-900 focus:outline-none focus:ring-2 focus:ring-purple-500/20 focus:border-purple-500 transition-all duration-200"
                          >
                            <option value="system">System Default</option>
                            <option value="custom">Custom Template</option>
                          </select>
                        </div>
                        <Input
                          label="Template URL"
                          placeholder="https://example.com/template.jpg"
                          value={cat.templateUrl || ''}
                          onChange={e => updateCategory(index, 'templateUrl', e.target.value)}
                          className="border-slate-300 dark:border-slate-600 focus:border-purple-500 focus:ring-purple-500/20"
                        />
                      </div>
                    </div>

                    {/* Internal toggle */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-indigo-500 rounded-full"></div>
                        Visibilitas Tiket
                      </h4>
                      <div className="space-y-4">
                        <label className="flex items-center justify-between cursor-pointer group">
                          <div>
                            <div className="text-sm font-medium text-slate-700 dark:text-slate-300">
                              {cat.isInternal ? 'Internal Only' : 'Public Sale'}
                            </div>
                            <div className="text-xs text-slate-500 dark:text-slate-400">
                              {cat.isInternal ? 'Hanya untuk internal event' : 'Tampil di halaman publik'}
                            </div>
                          </div>
                          <div
                            onClick={() => updateCategory(index, 'isInternal', !cat.isInternal)}
                            className={`relative w-12 h-6 rounded-full transition-all duration-300 shadow-sm ${
                              cat.isInternal ? 'bg-amber-500 shadow-amber-500/25' : 'bg-slate-300 dark:bg-slate-600'
                            }`}
                          >
                            <div
                              className={`absolute top-1 w-4 h-4 rounded-full bg-white shadow-md transition-all duration-300 ${
                                cat.isInternal ? 'translate-x-6' : 'translate-x-1'
                              }`}
                            />
                          </div>
                        </label>
                      </div>
                    </div>

                    {/* Color */}
                    <div className="bg-white dark:bg-slate-800 rounded-lg p-4 border border-slate-200 dark:border-slate-700">
                      <h4 className="text-sm font-semibold text-slate-700 dark:text-slate-300 mb-4 flex items-center gap-2">
                        <div className="w-2 h-2 bg-pink-500 rounded-full"></div>
                        Tema Warna
                      </h4>
                      <div className="space-y-3">
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={cat.colorHex || '#6366f1'}
                            onChange={e => updateCategory(index, 'colorHex', e.target.value)}
                            className="w-12 h-10 rounded-lg border-2 border-white dark:border-slate-600 shadow-sm cursor-pointer hover:scale-105 transition-transform"
                          />
                          <Input
                            placeholder="#6366f1"
                            value={cat.colorHex || ''}
                            onChange={e => updateCategory(index, 'colorHex', e.target.value)}
                            className="border-slate-300 dark:border-slate-600 focus:border-pink-500 focus:ring-pink-500/20"
                          />
                        </div>
                        <div className="flex items-center gap-2 text-xs text-slate-500">
                          <div
                            className="w-4 h-4 rounded-full shadow-sm"
                            style={{ backgroundColor: cat.colorHex || '#6366f1' }}
                          ></div>
                          Preview warna tiket
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Sold info */}
                  {typeof cat.sold === 'number' && cat.sold > 0 && (
                    <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg p-4">
                      <div className="flex items-center gap-3">
                        <div className="p-2 bg-amber-100 dark:bg-amber-800 rounded-lg">
                          <Ticket className="w-4 h-4 text-amber-600 dark:text-amber-400" />
                        </div>
                        <div>
                          <div className="text-sm font-semibold text-amber-800 dark:text-amber-200">
                            {cat.sold} Tiket Terjual
                          </div>
                          <div className="text-xs text-amber-600 dark:text-amber-400">
                            Kuota tidak dapat dikurangi setelah ada penjualan
                          </div>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}
      </div>

      <div className="flex justify-between items-center pt-6 border-t border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 -mx-6 -mb-6 px-6 py-4 rounded-b-xl">
        <div className="text-sm text-slate-600 dark:text-slate-400">
          {categories.length > 0 && (
            <span>{categories.length} kategori tiket akan disimpan</span>
          )}
        </div>
        <Button
          onClick={handleSave}
          disabled={saving || categories.length === 0}
          className="bg-blue-500 hover:bg-blue-600 disabled:bg-slate-400 shadow-md hover:shadow-lg transition-all duration-200 px-6 py-2.5"
        >
          {saving ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Save className="w-4 h-4 mr-2" />}
          {saving ? 'Menyimpan...' : 'Simpan Perubahan'}
        </Button>
      </div>
    </div>
  );
}

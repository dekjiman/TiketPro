'use client';


import { Card, CardContent, CardHeader, CardTitle, Button } from '@/components/ui';
import { Minus, Plus } from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
  saleStartAt?: string;
}

interface TicketSelectionProps {
  categories: TicketCategory[];
  selectedItems: { categoryId: string; qty: number }[];
  onSelectionChange: (items: { categoryId: string; qty: number }[]) => void;
  disabled?: boolean;
}

export default function TicketSelection({ categories, selectedItems, onSelectionChange, disabled = false }: TicketSelectionProps) {
  const formatSaleStart = (value?: string) => {
    if (!value) return '';
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return '';
    return date.toLocaleString('id-ID', {
      weekday: 'short',
      day: '2-digit',
      month: 'short',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  const updateQuantity = (categoryId: string, newQty: number) => {
    const updated = selectedItems.filter(item => item.categoryId !== categoryId);
    if (newQty > 0) {
      updated.push({ categoryId, qty: newQty });
    }
    onSelectionChange(updated);
  };

  const getQuantity = (categoryId: string) => {
    return selectedItems.find(item => item.categoryId === categoryId)?.qty || 0;
  };

  const getBadgeInfo = (category: TicketCategory) => {
    if (category.status === 'SOLD_OUT') return { text: 'Stok Habis', class: 'bg-gray-100 text-gray-500' };
    if (category.status === 'UPCOMING') return { text: 'Belum Dibuka', class: 'bg-yellow-100 text-yellow-700' };
    if (category.status === 'CLOSED' || category.status?.toLowerCase() === 'close') {
      return { text: 'Penjualan Ditutup', class: 'bg-slate-100 text-slate-600' };
    }
    if (category.available <= 10) return { text: `Tersisa ${category.available}`, class: 'bg-red-100 text-red-600' };
    return { text: 'Tersedia', class: 'bg-green-100 text-green-700' };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pilih Tiket</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map(category => {
            const qty = getQuantity(category.id);
            const badge = getBadgeInfo(category);
            const isClosed = category.status === 'CLOSED' || category.status?.toLowerCase() === 'close';
            const isDisabled = category.status === 'SOLD_OUT' || category.status === 'UPCOMING' || isClosed;
            
            return (
              <div key={category.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{category.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge.class}`}>{badge.text}</span>
                  </div>
                  <p className="text-xl font-bold text-emerald-600">
                    {category.price === 0 ? 'FREE' : `Rp${category.price.toLocaleString('id-ID')}`}
                  </p>
                  <p className="text-sm text-gray-500">Max per order: {category.maxPerOrder}</p>
                  {category.status === 'UPCOMING' && category.saleStartAt && (
                    <p className="text-xs text-amber-700 mt-1">
                      Penjualan mulai pada {formatSaleStart(category.saleStartAt)}
                    </p>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(category.id, Math.max(0, qty - 1))}
                    disabled={disabled || isDisabled || qty <= 0}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-8 text-center">{qty}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(category.id, Math.min(category.maxPerOrder, category.available, qty + 1))}
                    disabled={disabled || isDisabled || qty >= category.maxPerOrder || qty >= category.available}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}

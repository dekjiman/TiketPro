'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { ArrowLeft, Calendar, Receipt, Loader2 } from 'lucide-react';

export default function OrderDetailPage() {
  const params = useParams();
  const router = useRouter();
  const orderId = params.orderId as string;

  const { data: order, isLoading, error } = useQuery({
    queryKey: ['order-detail', orderId],
    queryFn: async () => {
      const res = await api.get(`/api/orders/${orderId}`);
      return res.data;
    },
    enabled: !!orderId,
  });

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !order) {
    return (
      <div className="container mx-auto px-4 py-10 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Pesanan Tidak Ditemukan</h2>
        <Button onClick={() => router.push('/dashboard')}>Kembali ke Dashboard</Button>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-3xl">
        <Button variant="ghost" className="mb-6" onClick={() => router.push('/dashboard')}>
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Receipt className="w-5 h-5 text-emerald-600" />
              Detail Pesanan
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <p className="text-xs text-gray-500">Order ID</p>
                <p className="font-mono text-sm font-semibold">{order.id}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Status</p>
                <p className="font-semibold">{order.status}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Event</p>
                <p className="font-semibold">{order.event?.title || '-'}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500">Pembeli</p>
                <p className="font-semibold">{order.buyerName || order.user?.name || '-'}</p>
                {order.buyerEmail && <p className="text-xs text-gray-500">{order.buyerEmail}</p>}
              </div>
              <div>
                <p className="text-xs text-gray-500">Tanggal</p>
                <p className="font-semibold flex items-center gap-1">
                  <Calendar className="w-4 h-4 text-gray-500" />
                  {new Date(order.createdAt).toLocaleString('id-ID')}
                </p>
              </div>
            </div>

            <div className="border rounded-lg p-4">
              <h3 className="font-semibold mb-3">Item Pesanan</h3>
              <div className="space-y-2">
                {(order.items || []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between text-sm">
                    <span>{item.category?.name || 'Tiket'} x{item.quantity}</span>
                    <span>Rp{Number(item.subtotal || 0).toLocaleString('id-ID')}</span>
                  </div>
                ))}
              </div>
            </div>

            <div className="border rounded-lg p-4 space-y-2">
              <div className="flex items-center justify-between text-sm">
                <span>Total</span>
                <span className="font-semibold">Rp{Number(order.totalAmount || 0).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex items-center justify-between text-sm">
                <span>Diskon</span>
                <span>- Rp{Number(order.discountAmount || 0).toLocaleString('id-ID')}</span>
              </div>
              <div className="flex items-center justify-between text-base font-bold">
                <span>Final</span>
                <span>Rp{Number(order.finalAmount || 0).toLocaleString('id-ID')}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

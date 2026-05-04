'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, Ticket, Clock, AlertCircle, Plus, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';

interface Ticket {
  id: string;
  ticketCode: string;
  holderName: string;
  status: string;
  category: { name: string; colorHex?: string };
  isInternal: boolean;
  order: {
    event: { title: string; startDate: string; city: string };
  };
  qrImageUrl?: string;
  pdfUrl?: string;
}

interface Order {
  id: string;
  status: string;
  totalAmount: number;
  finalAmount: number;
  expiredAt: string;
  event: { title: string; startDate: string };
}

function formatCurrency(amount: number): string {
  return new Intl.NumberFormat('id-ID', {
    style: 'currency',
    currency: 'IDR',
    minimumFractionDigits: 0,
  }).format(amount);
}

function formatDate(date: string): string {
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatCountdown(expiredAt: string): string {
  const diff = new Date(expiredAt).getTime() - Date.now();
  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}j ${mins % 60}m`;
  return `${mins}m`;
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [loading, setLoading] = useState(false);

  const handleDownload = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/tickets/${ticket.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticket.ticketCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch {
      toast.error('Gagal download');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/resend`, { channel: 'both' });
      toast.success('Tiket dikirim ulang');
    } catch (err) {
      toast.error(getApiError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const isTransferable = ticket.status === 'ACTIVE' && !ticket.isInternal;

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-hidden">
      <div
        className="h-2"
        style={{ backgroundColor: ticket.category.colorHex || '#065F46' }}
      />
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-lg">{ticket.order.event.title}</h3>
            <p className="text-sm text-gray-500">
              {formatDate(ticket.order.event.startDate)} • {ticket.order.event.city}
            </p>
          </div>
          <span className="px-2 py-1 text-xs font-medium rounded-full bg-green-100 text-green-800">
            {ticket.status}
          </span>
        </div>

        <div className="space-y-2 mb-4">
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Kategori</span>
            <span className="font-medium">{ticket.category.name}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Pemegang</span>
            <span className="font-medium">{ticket.holderName}</span>
          </div>
          <div className="flex justify-between text-sm">
            <span className="text-gray-500">Kode</span>
            <span className="font-mono text-sm">{ticket.ticketCode}</span>
          </div>
        </div>

        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={handleDownload} disabled={loading}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Download'}
          </Button>
          <Button variant="outline" size="sm" onClick={handleResend} disabled={loading}>
            Kirim Ulang
          </Button>
          {isTransferable && (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/my-tickets/tickets/${ticket.id}/transfer`}>
                <RefreshCw className="h-4 w-4 mr-1" />
                Transfer
              </Link>
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}

function OrderCard({ order, onPay }: { order: Order; onPay: () => void }) {
  const [loading, setLoading] = useState(false);
  const countdown = formatCountdown(order.expiredAt);

  return (
    <div className="bg-white rounded-lg border shadow-sm p-4">
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{order.event.title}</h3>
          <p className="text-sm text-gray-500">
            {formatDate(order.event.startDate)}
          </p>
        </div>
        {countdown !== 'Expired' && (
          <div className="flex items-center gap-1 text-sm text-orange-600">
            <Clock className="h-4 w-4" />
            <span>{countdown}</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className="font-bold text-lg">{formatCurrency(order.finalAmount)}</span>
        <Button onClick={onPay} disabled={loading || countdown === 'Expired'}>
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : 'Bayar Sekarang'}
        </Button>
      </div>
    </div>
  );
}

export function MyTicketsClient() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState('active');

  const { data: activeTickets, isLoading: loadingActive } = useQuery({
    queryKey: ['tickets', 'ACTIVE'],
    queryFn: async () => {
      const res = await api.get('/tickets/mine?status=ACTIVE');
      return res.data.tickets as Ticket[];
    },
  });

  const { data: pendingOrders, isLoading: loadingPending } = useQuery({
    queryKey: ['orders', 'PENDING'],
    queryFn: async () => {
      const res = await api.get('/orders/mine?status=PENDING');
      return res.data as Order[];
    },
  });

  const { data: allTickets, isLoading: loadingAll } = useQuery({
    queryKey: ['tickets', 'all'],
    queryFn: async () => {
      const res = await api.get('/tickets/mine');
      return res.data.tickets as Ticket[];
    },
  });

  const handlePay = async (order: Order) => {
    try {
      const res = await api.get(`/orders/${order.id}`);
      const { paymentToken, paymentUrl } = res.data;
      if (paymentToken && window.snap) {
        window.snap.pay(paymentToken, {
          onSuccess: () => router.push(`/checkout/success?orderId=${order.id}`),
          onPending: () => router.refresh(),
          onError: (err: any) => toast.error(err.status_message || 'Payment failed'),
        });
      } else if (paymentUrl) {
        window.location.href = paymentUrl;
      }
    } catch (err) {
      toast.error(getApiError(err).message);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Tiket Saya</h1>
          <Button asChild>
            <Link href="/events">
              <Plus className="h-4 w-4 mr-2" />
              Cari Tiket
            </Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className="mb-6">
            <TabsTrigger value="active">
              Aktif ({activeTickets?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="pending">
              Pending ({pendingOrders?.length || 0})
            </TabsTrigger>
            <TabsTrigger value="all">
              Semua ({allTickets?.length || 0})
            </TabsTrigger>
          </TabsList>

          <TabsContent value="active">
            {loadingActive ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : activeTickets?.length === 0 ? (
              <div className="text-center py-12">
                <Ticket className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  Belum ada tiket aktif
                </h3>
                <p className="text-gray-500 mb-4">
                  Beli tiket untuk melihatnya di sini
                </p>
                <Button asChild>
                  <Link href="/events">Cari Event</Link>
                </Button>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {activeTickets?.map((ticket) => (
                  <TicketCard key={ticket.id} ticket={ticket} />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="pending">
            {loadingPending ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : pendingOrders?.length === 0 ? (
              <div className="text-center py-12">
                <AlertCircle className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  Tidak ada pembayaran tertunda
                </h3>
                <p className="text-gray-500">
                  Semua pembayaran sudah selesai
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {pendingOrders?.map((order) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onPay={() => handlePay(order)}
                  />
                ))}
              </div>
            )}
          </TabsContent>

          <TabsContent value="all">
            {loadingAll ? (
              <div className="flex justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin" />
              </div>
            ) : allTickets?.length === 0 ? (
              <div className="text-center py-12">
                <Ticket className="h-16 w-16 mx-auto text-gray-300 mb-4" />
                <h3 className="text-lg font-medium text-gray-600 mb-2">
                  Belum ada tiket
                </h3>
                <Button asChild>
                  <Link href="/events">Cari Event</Link>
                </Button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-3 px-4 font-medium">Event</th>
                      <th className="text-left py-3 px-4 font-medium">Tanggal</th>
                      <th className="text-left py-3 px-4 font-medium">Kategori</th>
                      <th className="text-left py-3 px-4 font-medium">Status</th>
                      <th className="text-left py-3 px-4 font-medium">Aksi</th>
                    </tr>
                  </thead>
                  <tbody>
                    {allTickets?.map((ticket) => (
                      <tr key={ticket.id} className="border-b">
                        <td className="py-3 px-4">{ticket.order.event.title}</td>
                        <td className="py-3 px-4">
                          {formatDate(ticket.order.event.startDate)}
                        </td>
                        <td className="py-3 px-4">{ticket.category.name}</td>
                        <td className="py-3 px-4">
                          <span className="px-2 py-1 text-xs rounded-full bg-gray-100">
                            {ticket.status}
                          </span>
                        </td>
                        <td className="py-3 px-4">
                          <Button variant="ghost" size="sm" asChild>
                            <Link href={`/tickets/${ticket.id}`}>Lihat</Link>
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}

declare global {
  interface Window {
    snap: {
      pay: (token: string, options: any) => void;
    };
  }
}
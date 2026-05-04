'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/Tabs';
import { Loader2, Ticket, Clock, AlertCircle, Plus, RefreshCw, User, Eye } from 'lucide-react';
import { toast } from 'sonner';
import Link from 'next/link';
import { ensureMidtransSnap } from '@/lib/midtrans';
import axios from 'axios';

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
  user?: { name: string };
  tickets?: Array<{
    id: string;
    holderName: string;
    category: { name: string };
  }>;
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
  const expiredDate = new Date(expiredAt);
  const now = new Date();
  const diff = expiredDate.getTime() - now.getTime();

  if (diff <= 0) return 'Expired';
  const mins = Math.floor(diff / 60000);
  const hours = Math.floor(mins / 60);
  if (hours > 0) return `${hours}j ${mins % 60}m`;
  return `${mins}m`;
}

function getStatusBadge(status: string) {
  const statuses = {
    ACTIVE: { color: 'bg-green-100 text-green-800', label: 'Aktif' },
    PENDING: { color: 'bg-blue-100 text-blue-800', label: 'Diproses' },
    CHECKIN: { color: 'bg-gray-100 text-gray-800', label: 'Checkin' },
    USED: { color: 'bg-gray-100 text-gray-800', label: 'Checkin' },
    CANCELLED: { color: 'bg-red-100 text-red-800', label: 'Dibatalkan' }
  };
  return statuses[status as keyof typeof statuses] || { color: 'bg-gray-100 text-gray-800', label: status };
}

function TicketCard({ ticket }: { ticket: Ticket }) {
  const [loading, setLoading] = useState(false);
  const statusInfo = getStatusBadge(ticket.status);

  const handleDownload = async () => {
    if (!ticket.pdfUrl) {
      toast.error('PDF tiket belum siap. Klik "Generate Ulang PDF" untuk mencoba lagi.');
      return;
    }

    setLoading(true);
    try {
      const res = await api.get(`/api/tickets/${ticket.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `${ticket.ticketCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      toast.success('Tiket berhasil diunduh');
    } catch (err) {
      const code = axios.isAxiosError(err) ? (err.response?.data as any)?.error : '';
      if (code === 'PDF_NOT_FOUND') {
        toast.error('PDF tiket sedang digenerate ulang setelah transfer. Coba lagi beberapa detik.');
      } else {
        toast.error(getApiError(err).error || 'Gagal mengunduh tiket');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleRegeneratePdf = async () => {
    setLoading(true);
    try {
      await api.post(`/api/tickets/${ticket.id}/regenerate-pdf`);
      toast.success('Permintaan generate ulang PDF dikirim');
    } catch (err) {
      toast.error(getApiError(err).error || 'Gagal meminta generate ulang PDF');
    } finally {
      setLoading(false);
    }
  };

  const isTransferable = ticket.status === 'ACTIVE' && !ticket.isInternal;
  const isPdfReady = Boolean(ticket.pdfUrl);

  return (
    <div className="bg-white rounded-lg border shadow-sm overflow-visible">
      <div
        className="h-2"
        style={{ backgroundColor: ticket.category.colorHex || 'var(--primary)' }}
      />
      <div className="p-4">
        <div className="flex justify-between items-start mb-3">
          <div>
            <h3 className="font-semibold text-lg">{ticket.order.event.title}</h3>
            <p className="text-sm text-gray-500">
              {formatDate(ticket.order.event.startDate)} • {ticket.order.event.city}
            </p>
          </div>
          <span className={`px-2 py-1 text-xs font-medium rounded-full ${statusInfo.color}`}>
            {statusInfo.label}
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
          {ticket.status === 'ACTIVE' ? (
            <>
              <Button
                variant="outline"
                size="sm"
                onClick={isPdfReady ? handleDownload : handleRegeneratePdf}
                disabled={loading}
              >
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isPdfReady ? 'Download' : 'Generate Ulang PDF'}
              </Button>
              {isTransferable && (
                <Button variant="outline" size="sm" asChild>
                  <Link href={`/dashboard/my-tickets/tickets/${ticket.id}/transfer`}>
                    <span className="flex items-center">
                      <RefreshCw className="h-4 w-4 mr-1" />
                      Transfer
                    </span>
                  </Link>
                </Button>
              )}
            </>
          ) : (
            <Button variant="outline" size="sm" asChild>
              <Link href={`/dashboard/my-tickets/tickets/${ticket.id}`}>
                <span className="flex items-center">
                  <Eye className="h-4 w-4 mr-1" />
                  Lihat
                </span>
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
  const isExpired = countdown === 'Expired';

  // Get holder name(s) from tickets or buyer name
  const getHolderDisplay = () => {
    if (order.tickets && order.tickets.length > 0) {
      if (order.tickets.length === 1) {
        return `Pemegang: ${order.tickets[0].holderName}`;
      }
      // Multiple tickets - show first holder + count
      const firstHolder = order.tickets[0].holderName;
      const remaining = order.tickets.length - 1;
      return `Pemegang: ${firstHolder}${remaining > 0 ? ` +${remaining} lainnya` : ''}`;
    }

    // No tickets yet - show buyer name
    return `Pembeli: ${order.user?.name || 'N/A'}`;
  };

  return (
    <div className={`bg-white rounded-lg border shadow-sm p-4 ${isExpired ? 'border-red-200 bg-red-50' : 'border-orange-200 bg-orange-50'}`}>
      <div className="flex justify-between items-start mb-3">
        <div>
          <h3 className="font-semibold">{order.event.title}</h3>
          <p className="text-sm text-gray-500">
            {formatDate(order.event.startDate)}
          </p>
          <div className="flex items-center text-sm text-gray-600 mt-1">
            <User className="h-3 w-3 mr-1" />
            <span>{getHolderDisplay()}</span>
          </div>
        </div>
        {isExpired ? (
          <div className="flex items-center gap-1 text-sm text-red-600">
            <AlertCircle className="h-4 w-4" />
            <span>Kedaluwarsa</span>
          </div>
        ) : (
          <div className="flex items-center gap-1 text-sm text-orange-600">
            <Clock className="h-4 w-4" />
            <span>{countdown} tersisa</span>
          </div>
        )}
      </div>

      <div className="flex justify-between items-center">
        <span className="font-bold text-lg">{formatCurrency(order.finalAmount)}</span>
        <Button
          onClick={onPay}
          disabled={loading || isExpired}
          variant={isExpired ? 'outline' : 'primary'}
          className={isExpired ? 'opacity-50 cursor-not-allowed' : ''}
        >
          {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : isExpired ? 'Kedaluwarsa' : 'Bayar Sekarang'}
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
      const res = await api.get('/api/tickets/mine?status=ACTIVE');
      return res.data.tickets as Ticket[];
    },
    refetchInterval: (query) => {
      const tickets = (query.state.data as Ticket[] | undefined) || [];
      const hasPendingPdf = tickets.some((t) => !t.pdfUrl);
      return hasPendingPdf ? 5000 : false;
    },
  });

  const { data: pendingOrders, isLoading: loadingPending } = useQuery({
    queryKey: ['orders', 'PENDING'],
    queryFn: async () => {
      const res = await api.get('/api/orders/mine?status=PENDING');
      return res.data as Order[];
    },
  });

  const { data: allTickets, isLoading: loadingAll } = useQuery({
    queryKey: ['tickets', 'all'],
    queryFn: async () => {
      const res = await api.get('/api/tickets/mine');
      return res.data.tickets as Ticket[];
    },
  });

  const handlePay = async (order: Order) => {
    try {
      const res = await api.get(`/api/orders/${order.id}`);
      const { paymentToken, paymentUrl } = res.data;
      const snap = paymentToken ? await ensureMidtransSnap() : null;
      if (paymentToken && snap?.pay) {
        const redirectSlug = (order as any)?.event?.slug || (order as any)?.event?.id || 'events';
        snap.pay(paymentToken, {
          onSuccess: () => router.push(`/checkout/${redirectSlug}/success?orderId=${order.id}`),
          onPending: () => router.refresh(),
          onError: (err: any) => toast.error(err.status_message || 'Payment failed'),
        });
      } else if (paymentUrl) {
        window.location.href = paymentUrl;
      }
    } catch (err) {
      toast.error(getApiError(err).error);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h1 className="text-2xl font-bold">Tiket Saya</h1>
          <Button asChild>
            <Link href="/events">
              <span className="flex items-center">
                <Plus className="h-4 w-4 mr-2" />
                Cari Tiket
              </span>
            </Link>
          </Button>
        </div>

        <Tabs value={activeTab} onValueChange={setActiveTab} defaultValue="active">
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
                            <Link href={`/dashboard/my-tickets/tickets/${ticket.id}`}>Lihat</Link>
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

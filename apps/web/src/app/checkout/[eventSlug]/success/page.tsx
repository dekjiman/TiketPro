'use client';

import { useEffect, useState } from 'react';
import { useParams, useSearchParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle, Ticket, Share2, Loader2, XCircle, RefreshCw } from 'lucide-react';
import { PublicNavbar } from '@/components/PublicNavbar';
import { toast } from 'sonner';

export default function CheckoutSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const router = useRouter();
  const eventSlug = params.eventSlug as string;
  const orderId = searchParams.get('orderId');
  const [manualRefresh, setManualRefresh] = useState(0);

  const { data: order, isLoading, isError, refetch } = useQuery({
    queryKey: ['order-status', orderId, manualRefresh],
    queryFn: async () => {
      const res = await api.get(`/api/orders/${orderId}`);
      return res.data;
    },
    enabled: !!orderId,
    refetchInterval: (query) => {
      const data: any = query.state.data;
      if (data?.status === 'PENDING') return 3000; // Poll every 3s if still pending
      if (data?.status === 'PAID') return 2000; // Poll every 2s if paid but not fulfilled
      return false; // Stop polling if fulfilled or failed
    },
  });

  const handleManualRefresh = async () => {
    setManualRefresh(prev => prev + 1);
    await refetch();
    toast.success('Status diperbarui');
  };

  const isSuccess = order?.status === 'FULFILLED';
  const isProcessing = order?.status === 'PAID';
  const isPending = order?.status === 'PENDING';

  // Countdown timer logic
  const [timeLeft, setTimeLeft] = useState<string>('');
  useEffect(() => {
    if (!isPending || !order?.expiredAt) return;

    const timer = setInterval(() => {
      const now = new Date().getTime();
      const distance = new Date(order.expiredAt).getTime() - now;

      if (distance < 0) {
        clearInterval(timer);
        setTimeLeft('WAKTU HABIS');
        refetch();
        return;
      }

      const minutes = Math.floor((distance % (1000 * 60 * 60)) / (1000 * 60));
      const seconds = Math.floor((distance % (1000 * 60)) / 1000);
      setTimeLeft(`${minutes}:${seconds < 10 ? '0' : ''}${seconds}`);
    }, 1000);

    return () => clearInterval(timer);
  }, [isPending, order?.expiredAt, refetch]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50">
        <PublicNavbar />
        <div className="flex items-center justify-center p-4 pt-16">
          <div className="text-center">
            <Loader2 className="w-8 h-8 animate-spin mx-auto text-emerald-500 mb-4" />
            <p className="text-gray-600">Memverifikasi pembayaran Anda...</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicNavbar />
      
      {isPending && timeLeft && (
        <div className="bg-amber-50 border-b border-amber-100 py-2">
          <div className="max-w-md mx-auto px-4 flex items-center justify-center space-x-2 text-amber-800 text-sm font-medium">
            <RefreshCw className="w-4 h-4 animate-spin text-amber-400" />
            <span>Selesaikan pembayaran dalam <span className="font-bold font-mono text-base">{timeLeft}</span></span>
          </div>
        </div>
      )}

      <div className="flex items-center justify-center p-4 pt-8">
        <Card className="max-w-md w-full">
          <CardContent className="pt-6">
            <div className="text-center space-y-6">
              {isSuccess ? (
                <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
                  <CheckCircle className="w-8 h-8 text-green-600" />
                </div>
              ) : isProcessing ? (
                <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-blue-600 animate-spin" />
                </div>
              ) : isPending ? (
                <div className="w-16 h-16 bg-yellow-100 rounded-full flex items-center justify-center mx-auto">
                  <Loader2 className="w-8 h-8 text-yellow-600 animate-spin" />
                </div>
              ) : (
                <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto">
                  <XCircle className="w-8 h-8 text-red-600" />
                </div>
              )}

              <div>
                <h1 className="text-2xl font-bold text-gray-900">
                  {isSuccess ? 'Pembelian Berhasil!' : isProcessing ? 'Memproses Tiket' : isPending ? 'Menunggu Konfirmasi' : 'Pembayaran Gagal'}
                </h1>
                <p className="text-gray-600 mt-2">
                  {isSuccess
                    ? 'Tiket Anda telah berhasil dibuat dan dikirim ke email/WhatsApp Anda.'
                    : isProcessing
                    ? 'Pembayaran berhasil! Sedang membuat QR code dan PDF tiket Anda...'
                    : isPending
                    ? 'Kami sedang memproses pembayaran Anda. Mohon tunggu sebentar.'
                    : 'Terjadi masalah dengan pembayaran Anda. Silakan hubungi dukungan jika dana sudah terpotong.'}
                </p>
              </div>

              {orderId && (
                <div className="bg-gray-50 p-4 rounded-lg">
                  <p className="text-sm text-gray-500">Order ID</p>
                  <p className="font-mono font-semibold">{orderId}</p>
                </div>
              )}

              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={() => router.push('/dashboard/my-tickets')}
                  disabled={isPending || isProcessing}
                >
                  <Ticket className="w-4 h-4 mr-2" />
                  {isSuccess ? 'Lihat Tiket Saya' : isProcessing ? 'Memproses Tiket...' : 'Lihat Tiket Saya'}
                </Button>

                {(isPending || isProcessing) && (
                  <Button
                    variant="outline"
                    className="w-full"
                    onClick={handleManualRefresh}
                  >
                    <RefreshCw className="w-4 h-4 mr-2" />
                    Periksa Status
                  </Button>
                )}

                <Button variant="outline" className="w-full" onClick={() => router.push(`/events/${eventSlug}`)}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Kembali ke Event
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useMutation } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Button } from '@/components/ui/Button';
import { CheckCircle2, AlertCircle, Loader2, Calendar, MapPin, Ticket } from 'lucide-react';
import { PublicNavbar } from '@/components/PublicNavbar';
import { toast } from 'sonner';

export default function TransferAcceptPage() {
  const params = useParams();
  const router = useRouter();
  const transferId = params.transferId as string;

  const { data: transfer, isLoading, error } = useQuery({
    queryKey: ['transfer-detail', transferId],
    queryFn: async () => {
      const res = await api.get(`/api/tickets/transfers/${transferId}`);
      return res.data;
    },
    enabled: !!transferId,
    retry: false,
  });

  const queryError = error ? getApiError(error) : null;

  const acceptMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/tickets/transfers/${transferId}/accept`);
    },
    onSuccess: () => {
      toast.success('Tiket berhasil diterima!');
      router.push('/dashboard/my-tickets');
    },
    onError: (err) => {
      const apiErr = getApiError(err);
      toast.error(apiErr.error);
    },
  });

  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center">
          <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
        </div>
      </div>
    );
  }

  if (error || !transfer) {
    return (
      <div className="min-h-screen bg-gray-50 flex flex-col">
        <PublicNavbar />
        <div className="flex-1 flex items-center justify-center p-4">
          <Card className="max-w-md w-full">
            <CardContent className="pt-6 text-center">
              <AlertCircle className="w-12 h-12 text-red-500 mx-auto mb-4" />
              <h1 className="text-xl font-bold mb-2">Transfer Tidak Ditemukan</h1>
              <p className="text-gray-600 mb-2">
                {queryError?.error || 'Link transfer mungkin sudah kadaluwarsa atau tidak valid.'}
              </p>
              {queryError?.code && (
                <p className="text-xs text-gray-500 mb-6">Kode error: {queryError.code}</p>
              )}
              <Button onClick={() => router.push('/dashboard')} className="w-full">
                Kembali ke Dashboard
              </Button>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  }

  const isPending = transfer.status === 'PENDING';
  const isAccepted = transfer.status === 'ACCEPTED';
  const event = transfer.ticket?.order?.event;

  return (
    <div className="min-h-screen bg-gray-50 flex flex-col">
      <PublicNavbar />
      <div className="flex-1 flex items-center justify-center p-4">
        <Card className="max-w-md w-full">
          <CardHeader className="text-center pb-2">
            <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <Ticket className="w-8 h-8 text-blue-600" />
            </div>
            <CardTitle className="text-2xl font-bold">Terima Transfer Tiket</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div className="text-center text-gray-600">
              <p>
                <strong>{transfer.fromUser?.name || 'Seseorang'}</strong> ingin mengirimkan tiket kepada Anda.
              </p>
            </div>

            <div className="border rounded-xl p-4 bg-gray-50 space-y-4">
              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <h4 className="font-semibold text-sm">{event?.title}</h4>
                  <p className="text-xs text-gray-500">
                    {event?.startDate ? new Date(event.startDate).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      year: 'numeric',
                      month: 'long',
                      day: 'numeric',
                    }) : '-'}
                  </p>
                </div>
              </div>

              <div className="flex items-start gap-3">
                <div className="mt-1">
                  <MapPin className="w-4 h-4 text-emerald-600" />
                </div>
                <div>
                  <p className="text-xs font-medium">{event?.venues?.[0]?.name || event?.city}</p>
                </div>
              </div>

              <div className="pt-2 border-t flex justify-between items-center">
                <span className="text-xs text-gray-500">Kategori</span>
                <span className="text-sm font-bold text-emerald-700">{transfer.ticket?.category?.name}</span>
              </div>
            </div>

            {transfer.message && (
              <div className="bg-amber-50 border border-amber-100 rounded-lg p-3 italic text-sm text-amber-800">
                "{transfer.message}"
              </div>
            )}

            {isPending ? (
              <div className="space-y-3 pt-4">
                <Button 
                  className="w-full py-6 text-lg font-bold shadow-lg shadow-emerald-200"
                  onClick={() => acceptMutation.mutate()}
                  disabled={acceptMutation.isPending}
                >
                  {acceptMutation.isPending ? (
                    <Loader2 className="w-5 h-5 animate-spin mr-2" />
                  ) : (
                    <CheckCircle2 className="w-5 h-5 mr-2" />
                  )}
                  Terima Tiket Sekarang
                </Button>
                <p className="text-center text-xs text-gray-500">
                  Tiket akan langsung ditambahkan ke akun Anda setelah dikonfirmasi.
                </p>
              </div>
            ) : isAccepted ? (
              <div className="text-center space-y-4">
                <div className="p-3 bg-green-50 text-green-700 rounded-lg font-medium flex items-center justify-center gap-2">
                  <CheckCircle2 className="w-5 h-5" />
                  Tiket sudah diterima
                </div>
                <Button variant="outline" className="w-full" onClick={() => router.push('/dashboard/my-tickets')}>
                  Lihat Tiket Saya
                </Button>
              </div>
            ) : (
              <div className="p-3 bg-red-50 text-red-700 rounded-lg text-center text-sm font-medium">
                Transfer ini sudah tidak aktif ({transfer.status})
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

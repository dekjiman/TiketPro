
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api, getApiError } from '@/lib/api';
import { Button, Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Loader2, Calendar, MapPin, User, Download, RefreshCw, ArrowLeft } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function TicketDetailPage() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;
  const [downloading, setDownloading] = useState(false);

  const { data: ticket, isLoading, error } = useQuery({
    queryKey: ['ticket', ticketId],
    queryFn: async () => {
      const res = await api.get(`/api/tickets/${ticketId}`);
      return res.data;
    },
    enabled: !!ticketId,
  });

  const handleDownload = async () => {
    setDownloading(true);
    try {
      const res = await api.get(`/api/tickets/${ticketId}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = document.createElement('a');
      link.href = url;
      link.download = `ticket-${ticket.ticketCode}.pdf`;
      document.body.appendChild(link);
      link.click();
      link.remove();
    } catch (err) {
      toast.error('Gagal mengunduh tiket');
    } finally {
      setDownloading(false);
    }
  };

  if (isLoading) {
    return (
      <div className="flex justify-center py-20">
        <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (error || !ticket) {
    return (
      <div className="container mx-auto px-4 py-10 text-center">
        <h2 className="text-xl font-bold text-red-600 mb-4">Tiket Tidak Ditemukan</h2>
        <Button onClick={() => router.push('/dashboard/my-tickets')}>Kembali ke Tiket Saya</Button>
      </div>
    );
  }

  const event = ticket.order.event;

  return (
    <div className="min-h-screen bg-gray-50 py-8">
      <div className="container mx-auto px-4 max-w-2xl">
        <Button 
          variant="ghost" 
          className="mb-6" 
          onClick={() => router.push('/dashboard/my-tickets')}
        >
          <ArrowLeft className="h-4 w-4 mr-2" />
          Kembali
        </Button>

        <Card className="overflow-hidden border-t-8 border-t-emerald-600">
          <CardHeader className="bg-white">
            <div className="flex justify-between items-start">
              <div>
                <CardTitle className="text-2xl font-bold">{event.title}</CardTitle>
                <div className="flex flex-col gap-2 mt-2 text-gray-600">
                  <div className="flex items-center text-sm">
                    <Calendar className="h-4 w-4 mr-2" />
                    {new Date(event.startDate).toLocaleDateString('id-ID', {
                      weekday: 'long',
                      day: 'numeric',
                      month: 'long',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit'
                    })}
                  </div>
                  <div className="flex items-center text-sm">
                    <MapPin className="h-4 w-4 mr-2" />
                    {event.venues?.[0]?.name || 'Venue'}, {event.city}
                  </div>
                </div>
              </div>
              <div className="bg-emerald-100 text-emerald-800 px-3 py-1 rounded-full text-xs font-bold uppercase">
                {ticket.status}
              </div>
            </div>
          </CardHeader>
          <CardContent className="bg-white space-y-8 pb-10">
            <div className="flex justify-center pt-4">
              <div className="bg-gray-50 p-6 rounded-2xl border-2 border-dashed border-gray-200">
                {ticket.qrImageUrl ? (
                  <img src={ticket.qrImageUrl} alt="QR Code" className="w-48 h-48 mx-auto" />
                ) : (
                  <div className="w-48 h-48 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-sm text-center px-4">
                    QR Code Sedang Diproses...
                  </div>
                )}
                <div className="text-center mt-4">
                  <p className="text-xs text-gray-500 uppercase tracking-widest">Nomor Tiket</p>
                  <p className="text-lg font-mono font-bold text-gray-800">{ticket.ticketCode}</p>
                </div>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-100">
              <div>
                <p className="text-xs text-gray-500 uppercase">Kategori</p>
                <p className="font-semibold text-gray-900">{ticket.category.name}</p>
              </div>
              <div>
                <p className="text-xs text-gray-500 uppercase">Pemegang</p>
                <p className="font-semibold text-gray-900">{ticket.holderName}</p>
              </div>
            </div>

            <div className="flex flex-col gap-3 pt-4">
              {ticket.status === 'CANCELLED' ? (
                <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-center">
                  <p className="text-yellow-800 font-medium">Tiket Dibatalkan</p>
                  <p className="text-yellow-600 text-sm mt-1">
                    Tiket ini telah dibatalkan dan tidak dapat digunakan atau ditransfer.
                  </p>
                </div>
              ) : ticket.status === 'USED' || ticket.status === 'CHECKIN' ? (
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 text-center">
                  <p className="text-blue-800 font-medium">Tiket Sudah Checkin</p>
                  <p className="text-blue-600 text-sm mt-1">
                    Tiket ini telah digunakan dan tidak dapat ditransfer.
                  </p>
                </div>
              ) : (
                <>
                  <Button
                    className="w-full bg-emerald-600 hover:bg-emerald-700"
                    onClick={handleDownload}
                    disabled={downloading}
                  >
                    {downloading ? (
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    ) : (
                      <Download className="h-4 w-4 mr-2" />
                    )}
                    Unduh PDF Tiket
                  </Button>

                  {!ticket.isInternal && ticket.status === 'ACTIVE' && (
                    <Button
                      variant="outline"
                      className="w-full"
                      onClick={() => router.push(`/dashboard/my-tickets/tickets/${ticketId}/transfer`)}
                    >
                      <RefreshCw className="h-4 w-4 mr-2" />
                      Transfer Tiket
                    </Button>
                  )}
                </>
              )}
            </div>
          </CardContent>
        </Card>
        
        <div className="mt-8 text-center">
          <p className="text-sm text-gray-500">
            Ada pertanyaan? <a href="#" className="text-emerald-600 font-medium">Hubungi Kami</a>
          </p>
        </div>
      </div>
    </div>
  );
}

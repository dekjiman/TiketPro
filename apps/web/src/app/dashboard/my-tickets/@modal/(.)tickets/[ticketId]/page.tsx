
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { 
  Dialog, 
  DialogContent, 
  DialogHeader, 
  DialogTitle 
} from '@/components/ui/Dialog';
import { Button } from '@/components/ui/Button';
import { Loader2, Calendar, MapPin, Download, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';
import { useState } from 'react';

export default function TicketDetailModal() {
  const params = useParams();
  const router = useRouter();
  const ticketId = params.ticketId as string;
  const [downloading, setDownloading] = useState(false);

  const { data: ticket, isLoading } = useQuery({
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

  const close = () => router.back();

  return (
    <Dialog open onOpenChange={(open) => !open && close()}>
      <DialogContent className="max-w-md">
        {isLoading ? (
          <div className="flex justify-center py-10">
            <Loader2 className="h-8 w-8 animate-spin text-emerald-600" />
          </div>
        ) : ticket ? (
          <>
            <DialogHeader>
              <DialogTitle className="text-xl font-bold">{ticket.order.event.title}</DialogTitle>
              <div className="flex items-center text-xs text-gray-500 mt-1">
                <span className="bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-bold mr-2 uppercase">
                  {ticket.status}
                </span>
                {ticket.category.name}
              </div>
            </DialogHeader>

            <div className="space-y-6 pt-4">
              <div className="flex justify-center">
                <div className="bg-gray-50 p-4 rounded-xl border border-gray-100 w-full text-center">
                  {ticket.qrImageUrl ? (
                    <img src={ticket.qrImageUrl} alt="QR Code" className="w-40 h-40 mx-auto" />
                  ) : (
                    <div className="w-40 h-40 flex items-center justify-center bg-gray-100 rounded-lg text-gray-400 text-xs mx-auto">
                      QR Code Sedang Diproses...
                    </div>
                  )}
                  <p className="mt-2 font-mono font-bold text-gray-800">{ticket.ticketCode}</p>
                </div>
              </div>

              <div className="grid grid-cols-1 gap-3 text-sm">
                <div className="flex items-start">
                  <Calendar className="h-4 w-4 mr-2 text-gray-400 shrink-0 mt-0.5" />
                  <span>
                    {new Date(ticket.order.event.startDate).toLocaleDateString('id-ID', {
                      day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
                    })}
                  </span>
                </div>
                <div className="flex items-start">
                  <MapPin className="h-4 w-4 mr-2 text-gray-400 shrink-0 mt-0.5" />
                  <span>{ticket.order.event.city}</span>
                </div>
              </div>

              <div className="flex flex-col gap-2">
                <Button 
                  className="w-full bg-emerald-600" 
                  onClick={handleDownload}
                  disabled={downloading || ticket.status !== 'ACTIVE'}
                >
                  {downloading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Download className="h-4 w-4 mr-2" />}
                  Download PDF
                </Button>
                {!ticket.isInternal && ticket.status === 'ACTIVE' && (
                  <Button 
                    variant="outline" 
                    className="w-full"
                    onClick={() => router.push(`/dashboard/my-tickets/tickets/${ticketId}/transfer`)}
                  >
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Transfer
                  </Button>
                )}
              </div>
            </div>
          </>
        ) : (
          <div className="text-center py-10">
            <p className="text-gray-500">Gagal memuat data tiket</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

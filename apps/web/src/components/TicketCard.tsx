'use client';

import { useState, useCallback } from 'react';
import { api, getApiError } from '@/lib/api';
import {
  Button,
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui';
import {
  Download,
  Mail,
  RefreshCw,
  AlertCircle,
  Ticket,
  QrCode,
  Maximize2,
  X,
} from 'lucide-react';
import { toast } from 'sonner';
import Image from 'next/image';

interface TicketEvent {
  title: string;
  startDate: string;
  posterUrl?: string;
  venue?: { name: string; city: string };
}

interface TicketCardProps {
  ticket: {
    id: string;
    ticketCode: string;
    status: 'ACTIVE' | 'USED' | 'REFUNDED' | 'CANCELLED' | 'TRANSFERRED';
    holderName: string;
    isInternal: boolean;
    category: { name: string; colorHex?: string };
    event: TicketEvent;
    pdfUrl?: string;
    qrImageUrl?: string;
    usedAt?: string;
  };
  onDownload?: () => void;
  onResend?: () => void;
  onTransfer?: () => void;
  onRefund?: () => void;
}

function formatDate(date: string): string {
  if (!date) return '-';
  return new Date(date).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

function formatTime(date: string): string {
  if (!date) return '-';
  return new Date(date).toLocaleTimeString('id-ID', {
    hour: '2-digit',
    minute: '2-digit',
  });
}

const statusConfig = {
  ACTIVE: { label: 'Aktif', className: 'bg-green-100 text-green-800 border-green-200' },
  USED: { label: 'Digunakan', className: 'bg-gray-100 text-gray-800 border-gray-200' },
  REFUNDED: { label: 'Refund', className: 'bg-red-100 text-red-800 border-red-200' },
  CANCELLED: { label: 'Batal', className: 'bg-red-100 text-red-800 border-red-200' },
  TRANSFERRED: { label: 'Transfer', className: 'bg-blue-100 text-blue-800 border-blue-200' },
};

export function TicketCard({
  ticket,
  onDownload,
  onResend,
  onTransfer,
  onRefund,
}: TicketCardProps) {
  const [loading, setLoading] = useState(false);
  const [qrModalOpen, setQrModalOpen] = useState(false);
  const [resendDialogOpen, setResendDialogOpen] = useState(false);
  const [transferDialogOpen, setTransferDialogOpen] = useState(false);
  const [refundDialogOpen, setRefundDialogOpen] = useState(false);
  const [qrVisible, setQrVisible] = useState(false);

  const status = statusConfig[ticket.status] || statusConfig.ACTIVE;
  const isUsed = ticket.status === 'USED';
  const isRefunded = ticket.status === 'REFUNDED';
  const isCancelled = ticket.status === 'CANCELLED';
  const isTransferable = ticket.status === 'ACTIVE' && !ticket.isInternal;
  const isRefundable = ticket.status === 'ACTIVE' && !ticket.isInternal;

  const handleDownloadPdf = async () => {
    if (!ticket.pdfUrl) return;
    setLoading(true);
    try {
      const res = await api.get(`/tickets/${ticket.id}/download`, { responseType: 'blob' });
      const url = window.URL.createObjectURL(new Blob([res.data]));
      const link = window.open(url, '_blank');
      link?.focus();
      toast.success('PDF downloaded');
    } catch (err) {
      toast.error(getApiError(err).message || 'Gagal download');
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async (channel: string) => {
    setLoading(true);
    try {
      await api.post(`/tickets/${ticket.id}/resend`, { channel });
      toast.success(`Tiket dikirim via ${channel === 'both' ? 'email & WhatsApp' : channel}`);
      setResendDialogOpen(false);
    } catch (err) {
      toast.error(getApiError(err).message || 'Gagal mengirim');
    } finally {
      setLoading(false);
    }
  };

  const handleTransfer = () => {
    setTransferDialogOpen(false);
    onTransfer?.();
  };

  const handleRefund = () => {
    setRefundDialogOpen(false);
    onRefund?.();
  };

  const toggleQr = useCallback(() => {
    setQrVisible((v) => !v);
  }, []);

  return (
    <TooltipProvider>
      <div className="bg-white rounded-xl border shadow-sm overflow-hidden">
        <div
          className="h-1"
          style={{ backgroundColor: ticket.category.colorHex || '#065F46' }}
        />

        <div className="p-4">
          <div className="flex gap-4 mb-4">
            <div className="w-16 h-20 rounded-lg overflow-hidden bg-gray-100 flex-shrink-0 relative">
              {ticket.event.posterUrl ? (
                <Image
                  src={ticket.event.posterUrl}
                  alt={ticket.event.title}
                  fill
                  className="object-cover"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <Ticket className="h-6 w-6 text-gray-400" />
                </div>
              )}
            </div>

            <div className="flex-1 min-w-0">
              <h3 className="font-semibold text-base truncate">
                {ticket.event.title}
              </h3>
              <p className="text-sm text-gray-500">
                {formatDate(ticket.event.startDate)} • {formatTime(ticket.event.startDate)}
              </p>
               {(ticket.event.venues?.[0]?.name || ticket.event.venues?.[0]?.city) && (
                 <p className="text-sm text-gray-500">
                   {[ticket.event.venues?.[0]?.name, ticket.event.venues?.[0]?.city].filter(Boolean).join(', ')}
                 </p>
               )}
            </div>
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
              <span className="font-mono text-sm bg-gray-100 px-2 py-0.5 rounded">
                {ticket.ticketCode}
              </span>
            </div>
            <div className="flex justify-between items-center">
              <span className="text-gray-500">Status</span>
              <span className={`px-2 py-1 text-xs rounded-full border ${status.className}`}>
                {status.label}
              </span>
            </div>
            {ticket.isInternal && (
              <div className="flex justify-between items-center">
                <span className="text-gray-500">Tipe</span>
                <span className="px-2 py-1 text-xs rounded-full bg-amber-100 text-amber-800 border border-amber-200">
                  COMPLIMENTARY
                </span>
              </div>
            )}
            {isUsed && ticket.usedAt && (
              <div className="text-xs text-gray-500">
                Digunakan: {formatDate(ticket.usedAt)} {formatTime(ticket.usedAt)}
              </div>
            )}
          </div>

          <div
            className="relative mb-4 cursor-pointer group"
            onClick={toggleQr}
            title={qrVisible ? 'Klik untuk sembunyikan' : 'Klik untuk tampilkan QR'}
          >
            <div className="flex items-center justify-center min-h-[100px] bg-gray-50 rounded-lg">
              {ticket.qrImageUrl ? (
                <div className="relative w-20 h-20">
                  <Image
                    src={ticket.qrImageUrl}
                    alt="QR Code"
                    fill
                    className={`object-contain transition-all ${
                      qrVisible ? '' : 'blur-lg brightness-50'
                    }`}
                  />
                  {!qrVisible && (
                    <div className="absolute inset-0 flex items-center justify-center">
                      <QrCode className="w-8 h-8 text-gray-400" />
                    </div>
                  )}
                </div>
              ) : (
                <QrCode className="w-8 h-8 text-gray-400" />
              )}
            </div>
            <div className="absolute inset-0 flex items-center justify-center opacity-0 group-hover:opacity-100 transition bg-black/20 rounded-lg">
              <Maximize2 className="w-6 h-6 text-white" />
            </div>
          </div>

          <Dialog open={qrModalOpen} onOpenChange={setQrModalOpen}>
            <DialogTrigger asChild>
              <Button variant="link" size="sm" className="w-full mb-4 text-gray-500">
                Tampilkan QR Code
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-md">
              <DialogHeader>
                <DialogTitle>QR Code - {ticket.ticketCode}</DialogTitle>
              </DialogHeader>
              <div className="flex flex-col items-center py-4">
                {ticket.qrImageUrl && (
                  <div className="relative w-[300px] h-[300px]">
                    <Image
                      src={ticket.qrImageUrl}
                      alt="QR Code"
                      fill
                      className="object-contain"
                    />
                  </div>
                )}
                <p className="text-sm text-gray-500 mt-4 text-center">
                  Tunjukkan QR code ini kepada petugas di pintu masuk
                </p>
              </div>
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  if (ticket.qrImageUrl) {
                    const link = document.createElement('a');
                    link.href = ticket.qrImageUrl;
                    link.download = `${ticket.ticketCode}-qr.png`;
                    link.click();
                  }
                }}
              >
                <Download className="w-4 h-4 mr-2" />
                Download Image
              </Button>
            </DialogContent>
          </Dialog>

          <div className="flex flex-wrap gap-2">
            <Tooltip>
              <TooltipTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleDownloadPdf}
                  disabled={loading || !ticket.pdfUrl}
                >
                  <Download className="w-4 h-4 mr-1" />
                  PDF
                </Button>
              </TooltipTrigger>
              <TooltipContent>Download ticket sebagai PDF</TooltipContent>
            </Tooltip>

            <Dialog open={resendDialogOpen} onOpenChange={setResendDialogOpen}>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button variant="outline" size="sm" disabled={loading || !ticket.holderName}>
                    <Mail className="w-4 h-4 mr-1" />
                    Kirim
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Kirim Ulang Tiket</DialogTitle>
                </DialogHeader>
                <div className="space-y-2 py-4">
                  <Button className="w-full" onClick={() => handleResend('email')}>
                    Kirim via Email
                  </Button>
                  <Button className="w-full" onClick={() => handleResend('whatsapp')}>
                    Kirim via WhatsApp
                  </Button>
                  <Button className="w-full" onClick={() => handleResend('both')}>
                    Kirim via Email & WhatsApp
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={transferDialogOpen} onOpenChange={setTransferDialogOpen}>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isTransferable}
                  >
                    <RefreshCw className="w-4 h-4 mr-1" />
                    Transfer
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Transfer Tiket</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Anda akan mentransfer tiket ke orang lain. Penerima akan menerima tiketyang sama dengan data yang baru.
                  </p>
                  <Button className="w-full" onClick={handleTransfer}>
                    Lanjut ke Halaman Transfer
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            <Dialog open={refundDialogOpen} onOpenChange={setRefundDialogOpen}>
              <DialogTrigger asChild>
                <TooltipTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!isRefundable}
                  >
                    <AlertCircle className="w-4 h-4 mr-1" />
                    Refund
                  </Button>
                </TooltipTrigger>
              </DialogTrigger>
              <DialogContent>
                <DialogHeader>
                  <DialogTitle>Refund Tiket</DialogTitle>
                </DialogHeader>
                <div className="py-4">
                  <p className="text-sm text-gray-600 mb-4">
                    Anda akan mengajukan refund untuk tiketinI. Proses refund memerlukan persetujuan dariEO.
                  </p>
                  <Button className="w-full" onClick={handleRefund}>
                    Lanjut ke Halaman Refund
                  </Button>
                </div>
              </DialogContent>
            </Dialog>

            {(isUsed || isRefunded || isCancelled) && (
              <p className="w-full text-xs text-gray-500 text-center pt-2">
                {isUsed && ticket.usedAt
                  ? `Digunakan pada ${formatDate(ticket.usedAt)}`
                  : isRefunded
                  ? 'Sudah di-refund'
                  : 'Tiket dibatalkan'}
              </p>
            )}
          </div>
        </div>
      </div>
    </TooltipProvider>
  );
}
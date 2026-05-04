'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { TransferModal } from '@/components/TransferModal';
import { api, getApiError } from '@/lib/api';
import { Button } from '@/components/ui';
import { Loader2 } from 'lucide-react';
import { toast } from 'sonner';

interface PageProps {
  params: { ticketId: string };
}

interface PendingTransfer {
  id: string;
  toEmail: string;
  status: string;
  initiatedAt: string;
  expiredAt: string;
  message?: string | null;
}

export default function TransferPage({ params }: PageProps) {
  const router = useRouter();
  const [modalOpen, setModalOpen] = useState(false);
  const [loading, setLoading] = useState(true);
  const [resending, setResending] = useState(false);
  const [pendingTransfers, setPendingTransfers] = useState<PendingTransfer[]>([]);

  const loadPendingTransfers = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/tickets/${params.ticketId}/transfers/pending`);
      setPendingTransfers(res.data?.transfers || []);
    } catch (err) {
      const error = getApiError(err);
      toast.error(error.error || 'Gagal memuat transfer pending');
      setPendingTransfers([]);
    } finally {
      setLoading(false);
    }
  };

  const handleResend = async () => {
    setResending(true);
    try {
      await api.post(`/api/tickets/${params.ticketId}/transfer/resend`);
      toast.success('Undangan transfer berhasil dikirim ulang');
      await loadPendingTransfers();
    } catch (err) {
      const error = getApiError(err);
      toast.error(error.error || 'Gagal resend undangan transfer');
    } finally {
      setResending(false);
    }
  };

  useEffect(() => {
    void loadPendingTransfers();
  }, [params.ticketId]);

  return (
    <div className="min-h-screen bg-gray-50 dark:bg-slate-900">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-blue-600 hover:underline"
        >
          &larr; Kembali
        </button>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 p-5 mb-4">
          <h1 className="text-xl font-semibold text-slate-900 dark:text-white">Transfer Tiket</h1>
          <p className="text-sm text-slate-600 dark:text-slate-300 mt-1">
            Lihat transfer pending dan kirim ulang undangan bila diperlukan.
          </p>
          <div className="mt-4">
            <Button onClick={() => setModalOpen(true)}>Buka Form Transfer</Button>
          </div>
        </div>

        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 overflow-hidden">
          <div className="px-5 py-4 border-b border-slate-200 dark:border-slate-700 flex items-center justify-between">
            <h2 className="font-semibold text-slate-900 dark:text-white">Pending Transfers</h2>
            <Button variant="outline" onClick={() => loadPendingTransfers()} disabled={loading}>
              Refresh
            </Button>
          </div>

          {loading ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Memuat data transfer...</div>
          ) : pendingTransfers.length === 0 ? (
            <div className="p-6 text-sm text-slate-600 dark:text-slate-300">Belum ada transfer pending untuk tiket ini.</div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead className="bg-slate-50 dark:bg-slate-900/50">
                  <tr>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Recipient</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Status</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Initiated</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Expired</th>
                    <th className="px-4 py-3 text-left font-medium text-slate-600 dark:text-slate-300">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {pendingTransfers.map((transfer) => (
                    <tr key={transfer.id} className="border-t border-slate-100 dark:border-slate-700">
                      <td className="px-4 py-3 text-slate-800 dark:text-slate-100">{transfer.toEmail}</td>
                      <td className="px-4 py-3">
                        <span className="inline-flex rounded-full px-2 py-1 text-xs font-medium bg-amber-100 text-amber-700">
                          {transfer.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(transfer.initiatedAt).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3 text-slate-600 dark:text-slate-300">{new Date(transfer.expiredAt).toLocaleString('id-ID')}</td>
                      <td className="px-4 py-3">
                        <Button onClick={handleResend} disabled={resending} variant="outline" className="h-8 px-3">
                          {resending ? <Loader2 className="w-4 h-4 animate-spin" /> : 'Resend'}
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        <TransferModal
          ticketId={params.ticketId}
          isOpen={modalOpen}
          onClose={() => setModalOpen(false)}
          onSuccess={() => {
            setModalOpen(false);
            void loadPendingTransfers();
          }}
        />
      </div>
    </div>
  );
}

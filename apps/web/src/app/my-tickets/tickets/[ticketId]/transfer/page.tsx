'use client';

import { useRouter } from 'next/navigation';
import { TransferModal } from '@/components/TransferModal';

interface PageProps {
  params: { ticketId: string };
}

export default function TransferPage({ params }: PageProps) {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <button
          onClick={() => router.back()}
          className="mb-4 text-blue-600 hover:underline"
        >
          &larr; Kembali
        </button>
        <TransferModal
          ticketId={params.ticketId}
          isOpen={true}
          onClose={() => router.back()}
          onSuccess={() => router.back()}
        />
      </div>
    </div>
  );
}
'use client';

import { useRouter } from 'next/navigation';
import { TransferModal } from '@/components/TransferModal';

interface PageProps {
  params: { ticketId: string };
}

export default function TransferInterceptedPage({ params }: PageProps) {
  const router = useRouter();

  return (
    <TransferModal
      ticketId={params.ticketId}
      isOpen={true}
      onClose={() => router.back()}
      onSuccess={() => router.back()}
    />
  );
}
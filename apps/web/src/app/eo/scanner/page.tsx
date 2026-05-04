'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function EoScannerRedirectPage() {
  const router = useRouter();

  useEffect(() => {
    router.replace('/eo/checkin');
  }, [router]);

  return null;
}

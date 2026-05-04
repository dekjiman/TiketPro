'use client';

import { DashboardLayout } from '@/components/dashboard';
import { usePathname } from 'next/navigation';

export default function EOLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();
  const isBigScreenRoute = pathname === '/eo/lottery';

  if (isBigScreenRoute) {
    return <>{children}</>;
  }

  return (
    <DashboardLayout breadcrumbs={[{ label: 'EO Dashboard' }]}>
      {children}
    </DashboardLayout>
  );
}

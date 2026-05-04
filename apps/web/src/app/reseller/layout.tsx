'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function ResellerLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Reseller' }]}>
      {children}
    </DashboardLayout>
  );
}
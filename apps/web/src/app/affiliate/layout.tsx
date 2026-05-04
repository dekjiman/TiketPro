'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function AffiliateLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Affiliate' }]}>
      {children}
    </DashboardLayout>
  );
}
'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function CustomerDashboardLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Dashboard' }]}>
      {children}
    </DashboardLayout>
  );
}
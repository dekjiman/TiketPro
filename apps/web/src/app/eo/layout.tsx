'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function EOLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'EO Dashboard' }]}>
      {children}
    </DashboardLayout>
  );
}
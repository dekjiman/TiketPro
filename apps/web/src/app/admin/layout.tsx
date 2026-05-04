'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function AdminLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Admin' }]}>
      {children}
    </DashboardLayout>
  );
}
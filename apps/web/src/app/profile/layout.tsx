'use client';

import { DashboardLayout } from '@/components/dashboard';

export default function ProfileLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <DashboardLayout breadcrumbs={[{ label: 'Profile' }]}>
      {children}
    </DashboardLayout>
  );
}
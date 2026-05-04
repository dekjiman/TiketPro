'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';

export default function OrdersPage() {
  const [statusFilter, setStatusFilter] = useState('ALL');
  const [search, setSearch] = useState('');

  const { data: orders, isLoading, error } = useQuery({
    queryKey: ['orders-mine-dashboard'],
    queryFn: async () => {
      const res = await api.get('/api/orders/mine');
      return res.data as any[];
    },
  });

  const filteredOrders = useMemo(() => {
    const rows = orders || [];
    const q = search.trim().toLowerCase();
    return rows.filter((order) => {
      const statusOk = statusFilter === 'ALL' ? true : order.status === statusFilter;
      if (!statusOk) return false;
      if (!q) return true;

      const eventTitle = String(order.event?.title || '').toLowerCase();
      const orderId = String(order.id || '').toLowerCase();
      const ticketCodes = (order.tickets || []).map((t: any) => String(t.ticketCode || '').toLowerCase()).join(' ');
      const holderNames = (order.tickets || []).map((t: any) => String(t.holderName || '').toLowerCase()).join(' ');
      return (
        eventTitle.includes(q) ||
        orderId.includes(q) ||
        ticketCodes.includes(q) ||
        holderNames.includes(q)
      );
    });
  }, [orders, search, statusFilter]);

  if (isLoading) {
    return <p className="text-sm text-slate-500">Memuat pesanan...</p>;
  }

  if (error) {
    return <p className="text-sm text-red-600">Gagal memuat pesanan.</p>;
  }

  return (
    <div className="space-y-4">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
            <CardTitle>Orders</CardTitle>
            <div className="flex flex-col sm:flex-row gap-2">
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Cari tiket / order / holder..."
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              />
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="h-10 rounded-lg border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-emerald-500"
              >
                <option value="ALL">Semua Status</option>
                <option value="PENDING">PENDING</option>
                <option value="PAID">PAID</option>
                <option value="FULFILLED">FULFILLED</option>
                <option value="EXPIRED">EXPIRED</option>
                <option value="CANCELLED">CANCELLED</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!filteredOrders.length ? (
            <p className="text-sm text-slate-500">Belum ada pesanan.</p>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((order) => {
                const cardHolderName = order.tickets?.[0]?.holderName || order.user?.name || '-';
                return (
                  <Link
                    key={order.id}
                    href={`/dashboard/orders/${order.id}`}
                    className="block rounded-lg border border-slate-200 p-3 hover:bg-slate-50 transition-colors"
                  >
                    <div className="flex items-center justify-between">
                      <p className="font-semibold text-slate-900">{order.event?.title || 'Event'}</p>
                      <span className="text-xs px-2 py-1 rounded-full bg-slate-100 text-slate-700">{order.status}</span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1">{new Date(order.createdAt).toLocaleString('id-ID')}</p>
                    <p className="text-xs text-slate-600 mt-1">Card Holder: {cardHolderName}</p>
                    <p className="text-sm text-slate-700 mt-1">
                      Rp{Number(order.finalAmount || 0).toLocaleString('id-ID')}
                    </p>
                  </Link>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

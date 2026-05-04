'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { Users, Calendar, Ticket, DollarSign, Plus, Settings, Users2 } from 'lucide-react';

interface Stats {
  totalEvents: number;
  totalSold: number;
  totalRevenue: number;
  totalPaidOrders: number;
  totalCheckIn: number;
}

export default function EODashboardPage() {
  const router = useRouter();
  const { user, _hasHydrated } = useAuthStore();
  const toast = useToast();

  const [stats, setStats] = useState<Stats>({ totalEvents: 0, totalSold: 0, totalRevenue: 0, totalPaidOrders: 0, totalCheckIn: 0 });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (!user) {
      router.push('/login');
      return;
    }
    if (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [_hasHydrated, user, router]);

  useEffect(() => {
    if (!_hasHydrated) return;
    if (user?.role !== 'EO_ADMIN' && user?.role !== 'EO_STAFF') return;

    let isMounted = true;
    const fetchOverview = async () => {
      try {
        const res = await api.get('/api/eo/dashboard/overview');
        if (!isMounted) return;
        setStats({
          totalEvents: Number(res.data?.totalEvents || 0),
          totalSold: Number(res.data?.totalSold || 0),
          totalRevenue: Number(res.data?.totalRevenue || 0),
          totalPaidOrders: Number(res.data?.totalPaidOrders || 0),
          totalCheckIn: Number(res.data?.totalCheckIn || 0),
        });
      } catch (err: any) {
        if (!isMounted) return;
        toast.showToast('error', getApiError(err).error || 'Gagal memuat overview dashboard');
      } finally {
        if (isMounted) setLoading(false);
      }
    };

    fetchOverview();
    return () => {
      isMounted = false;
    };
  }, [_hasHydrated, user?.role]);

  if (!_hasHydrated || !user || (user.role !== 'EO_ADMIN' && user.role !== 'EO_STAFF')) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-6 lg:p-8 text-white">
        <p className="text-emerald-100 text-sm mb-1">EO Dashboard</p>
        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Welcome, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-emerald-100" style={{ fontFamily: 'Inter' }}>
          Kelola event dan tiket Anda
        </p>
      </div>

      <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
            <Calendar className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{loading ? '-' : stats.totalEvents}</p>
          <p className="text-xs text-slate-500">Total Events</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
            <Ticket className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{loading ? '-' : stats.totalSold}</p>
          <p className="text-xs text-slate-500">Tiket Terjual</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
            <DollarSign className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">
            {loading ? '-' : `Rp ${stats.totalRevenue.toLocaleString('id-ID').split(',')[0]}`}
          </p>
          <p className="text-xs text-slate-500">Revenue</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-indigo-50 text-indigo-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{loading ? '-' : stats.totalPaidOrders}</p>
          <p className="text-xs text-slate-500">Paid Orders</p>
        </div>
        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
          <div className="w-10 h-10 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center mb-3">
            <Users className="w-5 h-5" />
          </div>
          <p className="text-2xl font-bold">{loading ? '-' : stats.totalCheckIn}</p>
          <p className="text-xs text-slate-500">Check-in</p>
        </div>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        <Link href="/eo/events" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
              <Calendar className="w-6 h-6 text-emerald-700 dark:text-emerald-400" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Event Saya</h3>
              <p className="text-sm text-slate-500">Kelola dan buat event</p>
            </div>
          </div>
        </Link>

        <Link href="/eo/staff" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-purple-50 flex items-center justify-center">
              <Users2 className="w-6 h-6 text-purple-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Kelola Staff</h3>
              <p className="text-sm text-slate-500">Undang staff baru</p>
            </div>
          </div>
        </Link>

        <Link href="/eo/profile" className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6 hover:border-emerald-600 dark:hover:border-emerald-500 transition-colors">
          <div className="flex items-center gap-4">
            <div className="w-12 h-12 rounded-lg bg-blue-50 flex items-center justify-center">
              <Settings className="w-6 h-6 text-blue-600" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-900 dark:text-white">Profil EO</h3>
              <p className="text-sm text-slate-500">Informasi perusahaan</p>
            </div>
          </div>
        </Link>
      </div>
    </div>
  );
}

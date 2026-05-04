'use client';

import { useEffect, useState } from 'react';
import { useAuthStore } from '@/store/authStore';
import { Ticket, ShoppingBag, User, TrendingUp } from 'lucide-react';
import { api } from '@/lib/api';
import Link from 'next/link';
import { Button } from '@/components/ui';

interface DashboardStats {
  activeTickets: number;
  orders: number;
  points: number;
  referrals: number;
}

interface DashboardActivity {
  id: string;
  type: 'ORDER' | 'TICKET' | string;
  title: string;
  subtitle: string;
  createdAt: string;
  targetPath?: string;
}

export default function DashboardPage() {
  const { user } = useAuthStore();
  const [stats, setStats] = useState<DashboardStats>({
    activeTickets: 0,
    orders: 0,
    points: 0,
    referrals: 0,
  });
  const [activities, setActivities] = useState<DashboardActivity[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchDashboard = async () => {
      try {
        const res = await api.get('/api/users/dashboard');
        setStats(res.data?.stats || { activeTickets: 0, orders: 0, points: 0, referrals: 0 });
        setActivities(res.data?.activities || []);
      } catch (err) {
        console.error('[Dashboard] Failed to load dashboard data:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchDashboard();
  }, []);

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-emerald-700 to-emerald-600 rounded-2xl p-6 lg:p-8 text-white">
        <p className="text-emerald-100 text-sm mb-1">Dashboard</p>
        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Welcome back, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-emerald-100" style={{ fontFamily: 'Inter' }}>
          Kelola tiket dan pesanan Anda dengan mudah
        </p>
        <div className="mt-4">
          <Link href="/events">
            <Button className="bg-amber-300 text-slate-900 hover:bg-amber-200 border border-amber-100">
              Lihat Event
            </Button>
          </Link>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tiket Aktif', value: stats.activeTickets.toLocaleString('id-ID'), icon: Ticket, color: 'bg-blue-50 text-blue-600' },
          { label: 'Pesanan', value: stats.orders.toLocaleString('id-ID'), icon: ShoppingBag, color: 'bg-purple-50 text-purple-600' },
          { label: 'Points', value: stats.points.toLocaleString('id-ID'), icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
          { label: 'Referral', value: stats.referrals.toLocaleString('id-ID'), icon: User, color: 'bg-pink-50 text-pink-600' },
        ].map((stat) => (
          <div key={stat.label} className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
            <div className={`w-10 h-10 rounded-lg ${stat.color} flex items-center justify-center mb-3`}>
              <stat.icon className="w-5 h-5" />
            </div>
            <p className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope' }}>
              {stat.value}
            </p>
            <p className="text-xs text-slate-500 mt-0.5">{stat.label}</p>
          </div>
        ))}
      </div>

      {/* Recent Activity */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <h2 className="font-semibold text-slate-900 dark:text-white mb-4" style={{ fontFamily: 'Manrope' }}>
          Aktivitas Terbaru
        </h2>
        {loading ? (
          <p className="text-slate-500 text-sm">Memuat aktivitas...</p>
        ) : activities.length === 0 ? (
          <div className="text-center py-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
              <Ticket className="w-6 h-6 text-slate-400" />
            </div>
            <p className="text-slate-500 text-sm">Belum ada aktivitas</p>
          </div>
        ) : (
          <div className="space-y-3">
            {activities.map((activity) => (
              activity.targetPath ? (
                <Link
                  key={activity.id}
                  href={activity.targetPath}
                  className="block border border-slate-100 dark:border-slate-700 rounded-lg p-3 hover:bg-slate-50 dark:hover:bg-slate-700/40 transition-colors"
                >
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{activity.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{activity.subtitle}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(activity.createdAt).toLocaleString('id-ID')}
                  </p>
                </Link>
              ) : (
                <div key={activity.id} className="border border-slate-100 dark:border-slate-700 rounded-lg p-3">
                  <p className="text-sm font-semibold text-slate-900 dark:text-white">{activity.title}</p>
                  <p className="text-xs text-slate-500 mt-0.5">{activity.subtitle}</p>
                  <p className="text-xs text-slate-400 mt-1">
                    {new Date(activity.createdAt).toLocaleString('id-ID')}
                  </p>
                </div>
              )
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

'use client';

import { useAuthStore } from '@/store/authStore';
import { Ticket, ShoppingBag, User, TrendingUp } from 'lucide-react';

export default function DashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#065F46] to-emerald-600 rounded-2xl p-6 lg:p-8 text-white">
        <p className="text-emerald-100 text-sm mb-1">Dashboard</p>
        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Welcome back, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-emerald-100" style={{ fontFamily: 'Inter' }}>
          Kelola tiket dan pesanan Anda dengan mudah
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: 'Tiket Aktif', value: '0', icon: Ticket, color: 'bg-blue-50 text-blue-600' },
          { label: 'Pesanan', value: '0', icon: ShoppingBag, color: 'bg-purple-50 text-purple-600' },
          { label: 'Points', value: '0', icon: TrendingUp, color: 'bg-amber-50 text-amber-600' },
          { label: 'Referal', value: '0', icon: User, color: 'bg-pink-50 text-pink-600' },
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
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
            <Ticket className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">Belum ada aktivitas</p>
        </div>
      </div>
    </div>
  );
}
'use client';

import { useAuthStore } from '@/store/authStore';
import { Link2, TrendingUp, Wallet } from 'lucide-react';

export default function AffiliateDashboardPage() {
  const { user } = useAuthStore();

  return (
    <div className="space-y-6">
      {/* Welcome */}
      <div className="bg-gradient-to-r from-[#065F46] to-emerald-600 rounded-2xl p-6 lg:p-8 text-white">
        <p className="text-emerald-100 text-sm mb-1">Affiliate Dashboard</p>
        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Welcome, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-emerald-100" style={{ fontFamily: 'Inter' }}>
          Kelola link afiliasi dan komisi Anda
        </p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
        {[
          { label: 'Total Links', value: '0', icon: Link2, color: 'bg-blue-50 text-blue-600' },
          { label: 'Total Klik', value: '0', icon: TrendingUp, color: 'bg-purple-50 text-purple-600' },
          { label: 'Total Komisi', value: 'Rp 0', icon: Wallet, color: 'bg-amber-50 text-amber-600' },
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

      {/* My Links */}
      <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-semibold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope' }}>
            Link Saya
          </h2>
          <button className="text-sm text-[#065F46] hover:underline">+ Buat Link</button>
        </div>
        <div className="text-center py-8">
          <div className="w-12 h-12 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center mx-auto mb-3">
            <Link2 className="w-6 h-6 text-slate-400" />
          </div>
          <p className="text-slate-500 text-sm">Belum ada link afiliasi</p>
        </div>
      </div>
    </div>
  );
}
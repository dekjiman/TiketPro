'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function PendingApprovalPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (!user || user.status !== 'PENDING_APPROVAL') {
      router.push('/login');
    }
  }, [user, router]);

  const handleLogout = async () => {
    await logout();
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="animate-pulse">Memuat...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className="w-20 h-20 mx-auto bg-yellow-100 rounded-full flex items-center justify-center">
            <svg className="w-10 h-10 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4m0 4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope', color: '#0F172A' }}>
          Akun Sedang Ditinjau
        </h1>
        
        <p className="text-slate-600 mb-6" style={{ fontFamily: 'Inter' }}>
          Hai {user.name}, akun Anda sedang dalam proses persetujuan oleh tim TiketPro.
        </p>
        
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 text-left">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-emerald-700 dark:text-emerald-400 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
            <div>
              <p className="font-medium text-slate-900 text-sm mb-1">Yang perlu Anda ketahui:</p>
              <ul className="text-sm text-slate-600 space-y-1">
                <li>Persetujuan biasanya memakan waktu 1x24 jam</li>
                <li>Anda akan mendapat notifikasi email setelah disetujui</li>
                <li>Hubungi support@tiketpro.id untuk bantuan</li>
              </ul>
            </div>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full px-6 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition font-medium"
          style={{ fontFamily: 'Inter' }}
        >
          Masuk dengan Akun Lain
        </button>
      </div>
    </div>
  );
}

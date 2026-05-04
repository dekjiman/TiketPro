'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuthStore } from '@/store/authStore';

export default function SuspendedPage() {
  const router = useRouter();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    if (!user || (user.status !== 'SUSPENDED' && user.status !== 'BANNED')) {
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

  const isBanned = user.status === 'BANNED';

  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 px-4">
      <div className="max-w-md w-full text-center">
        <div className="mb-6">
          <div className={`w-20 h-20 mx-auto ${isBanned ? 'bg-red-100' : 'bg-orange-100'} rounded-full flex items-center justify-center`}>
            <svg className={`w-10 h-10 ${isBanned ? 'text-red-600' : 'text-orange-600'}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
            </svg>
          </div>
        </div>
        
        <h1 className="text-2xl font-bold mb-2" style={{ fontFamily: 'Manrope', color: '#0F172A' }}>
          {isBanned ? 'Akun Diblokir' : 'Akun Ditangguhkan'}
        </h1>
        
        <p className="text-slate-600 mb-6" style={{ fontFamily: 'Inter' }}>
          {isBanned 
            ? 'Maaf, akun Anda telah diblokir dan tidak dapat menggunakan TiketPro.' 
            : 'Maaf, akun Anda saat ini ditangguhkan dan tidak dapat diakses.'}
        </p>
        
        <div className="bg-white rounded-xl border border-slate-200 p-4 mb-6 text-left">
          <div className="flex items-start gap-3">
            <svg className="w-5 h-5 text-red-600 mt-0.5 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
            <div>
              <p className="font-medium text-slate-900 text-sm mb-1">Butuh bantuan?</p>
              <p className="text-sm text-slate-600">
                Hubungi kami di{' '}
                <a href="mailto:support@tiketpro.id" className="text-[#065F46] hover:underline">
                  support@tiketpro.id
                </a>{' '}
                jika Anda merasa ini adalah kesalahan.
              </p>
            </div>
          </div>
        </div>
        
        <button
          onClick={handleLogout}
          className="w-full px-6 py-3 border border-slate-300 rounded-lg text-slate-700 hover:bg-slate-50 transition font-medium"
          style={{ fontFamily: 'Inter' }}
        >
          Logout
        </button>
      </div>
    </div>
  );
}
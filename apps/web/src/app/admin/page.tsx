'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { Users, Calendar, AlertCircle, ArrowRight } from 'lucide-react';

interface Stats {
  totalEo: number;
  totalEvents: number;
  pendingEo: number;
  pendingEvents: number;
}

interface PendingEo {
  id: string;
  name: string;
  email: string;
  phone?: string;
  createdAt: string;
}

interface PendingEvent {
  id: string;
  title: string;
  slug: string;
  city: string;
  startDate: string;
  eoName?: string;
}

interface EoStats {
  id: string;
  companyName: string;
  userName: string;
  eventCount: number;
}

interface AdminStats {
  stats: Stats;
  pendingEoList: PendingEo[];
  pendingEventsList: PendingEvent[];
  eventsByEo: EoStats[];
}

export default function AdminDashboardPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  const [data, setData] = useState<AdminStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      toast.showToast('error', 'Access denied');
      router.push('/dashboard');
    }
  }, [user, router, toast]);

  const loadStats = async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get('/api/admin/stats');
      setData(response.data?.data || response.data || null);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      loadStats();
    }
  }, [user]);

  const handleApproveEo = async (id: string) => {
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await api.patch(`/api/admin/users/${id}/status`, { status: 'ACTIVE' });
      toast.showToast('success', 'EO Admin approved');
      loadStats();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setActionLoading(null);
    }
  };

  const handleRejectEo = async (id: string) => {
    if (!confirm('Tolak EO Admin ini?')) return;
    if (actionLoading) return;
    setActionLoading(id);
    try {
      await api.patch(`/api/admin/users/${id}/status`, { status: 'REJECTED' });
      toast.showToast('success', 'EO Admin rejected');
      loadStats();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setActionLoading(null);
    }
  };

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="bg-gradient-to-r from-purple-600 to-purple-800 rounded-2xl p-6 lg:p-8 text-white">
        <p className="text-purple-200 text-sm mb-1">Admin Panel</p>
        <h1 className="text-2xl lg:text-3xl font-bold mb-2" style={{ fontFamily: 'Manrope' }}>
          Welcome, {user?.name?.split(' ')[0]}!
        </h1>
        <p className="text-purple-200" style={{ fontFamily: 'Inter' }}>
          Super Admin Dashboard
        </p>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600">
          {error}
          <Button size="sm" variant="outline" onClick={loadStats} className="mt-2 ml-2">Coba Lagi</Button>
        </div>
      )}

      {loading && (
        <div className="flex justify-center py-12">
          <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
        </div>
      )}

      {!loading && !data && !error && (
        <div className="p-4 bg-amber-50 border border-amber-200 rounded-lg">
          <p className="text-amber-600">Data tidak tersedia.</p>
          <Button size="sm" variant="outline" onClick={loadStats} className="mt-2">Coba Lagi</Button>
        </div>
      )}

      {data && (
        <>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="w-10 h-10 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center mb-3">
                <Users className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.stats.totalEo}</p>
              <p className="text-xs text-slate-500">Total EO Admin</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="w-10 h-10 rounded-lg bg-purple-50 text-purple-600 flex items-center justify-center mb-3">
                <Calendar className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.stats.totalEvents}</p>
              <p className="text-xs text-slate-500">Total Events</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="w-10 h-10 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center mb-3">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.stats.pendingEo}</p>
              <p className="text-xs text-slate-500">Pending EO</p>
            </div>
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4">
              <div className="w-10 h-10 rounded-lg bg-red-50 text-red-600 flex items-center justify-center mb-3">
                <AlertCircle className="w-5 h-5" />
              </div>
              <p className="text-2xl font-bold text-slate-900 dark:text-white">{data.stats.pendingEvents}</p>
              <p className="text-xs text-slate-500">Need Approval</p>
            </div>
          </div>

          <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <AlertCircle className="w-5 h-5 text-amber-500" />
                Perlu Tindakan
              </h2>
            </div>

            <div className="grid md:grid-cols-2 gap-6">
              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-900 dark:text-white">Pending EO ({data.pendingEoList?.length || 0})</h3>
                  <Link href="/admin/users?status=PENDING_APPROVAL&role=EO_ADMIN" className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    Lihat semua <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                {!data.pendingEoList?.length ? (
                  <p className="text-slate-500 text-sm">Tidak ada pending EO</p>
                ) : (
                  <div className="space-y-2">
                    {data.pendingEoList.map((eo) => (
                      <div key={eo.id} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{eo.name}</p>
                          <p className="text-xs text-slate-500 truncate">{eo.email}</p>
                        </div>
                        <div className="flex gap-2 ml-2">
                          <Button size="sm" onClick={() => handleApproveEo(eo.id)} loading={actionLoading === eo.id}>
                            Approve
                          </Button>
                          <Button size="sm" variant="outline" onClick={() => handleRejectEo(eo.id)} loading={actionLoading === eo.id}>
                            Reject
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="font-medium text-slate-900 dark:text-white">Need Approval Event ({data.pendingEventsList?.length || 0})</h3>
                  <Link href="/admin/events?status=REVIEW" className="text-sm text-emerald-700 dark:text-emerald-400 flex items-center gap-1">
                    Lihat semua <ArrowRight className="w-4 h-4" />
                  </Link>
                </div>
                {!data.pendingEventsList?.length ? (
                  <p className="text-slate-500 text-sm">Tidak ada event perlu approval</p>
                ) : (
                  <div className="space-y-2">
                    {data.pendingEventsList.map((event) => (
                      <Link key={event.id} href={`/events/${event.slug}`} className="flex items-center justify-between p-3 bg-slate-50 dark:bg-slate-700 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-600 transition-colors">
                        <div className="min-w-0">
                          <p className="font-medium truncate">{event.title}</p>
                          <p className="text-xs text-slate-500 truncate">{event.city}</p>
                        </div>
                        <Button size="sm" variant="outline">Review</Button>
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            </div>
          </div>

          {data.eventsByEo?.length ? (
            <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
              <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg font-semibold">Event per EO</h2>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-slate-200 dark:border-slate-700">
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Company</th>
                      <th className="text-left py-2 px-3 font-medium text-slate-500">Admin</th>
                      <th className="text-right py-2 px-3 font-medium text-slate-500">Total Events</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.eventsByEo.map((eo) => (
                      <tr key={eo.id} className="border-b border-slate-100 dark:border-slate-700">
                        <td className="py-2 px-3">{eo.companyName}</td>
                        <td className="py-2 px-3 text-slate-500">{eo.userName}</td>
                        <td className="py-2 px-3 text-right font-medium">{eo.eventCount}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ) : null}
        </>
      )}
    </div>
  );
}

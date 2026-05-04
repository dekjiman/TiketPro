'use client';

import { useState, useEffect } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { 
  CheckCircle, XCircle, Search, Filter, 
  Loader2, ExternalLink, Calendar, MapPin, User 
} from 'lucide-react';
import Link from 'next/link';

export default function AdminEventsPage() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [filter, setFilter] = useState({ status: '', search: '' });
  const toast = useToast();

  const fetchEvents = async () => {
    setLoading(true);
    try {
      const query = new URLSearchParams(filter as any).toString();
      const res = await api.get(`/api/admin/events?${query}`);
      setEvents(res.data.events);
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchEvents();
  }, [filter.status]);

  const handleApprove = async (id: string) => {
    if (!confirm('Apakah Anda yakin ingin menyetujui event ini?')) return;
    setProcessingId(id);
    try {
      await api.post(`/api/admin/events/${id}/approve`);
      toast.showToast('success', 'Event berhasil disetujui dan dipublikasikan');
      fetchEvents();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string) => {
    const reason = prompt('Masukkan alasan penolakan:');
    if (reason === null) return;
    
    setProcessingId(id);
    try {
      await api.post(`/api/admin/events/${id}/reject`, { reason });
      toast.showToast('info', 'Event telah ditolak');
      fetchEvents();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setProcessingId(null);
    }
  };

  const getStatusBadge = (status: string) => {
    const styles: any = {
      PUBLISHED: 'bg-emerald-100 text-emerald-700 border-emerald-200',
      DRAFT: 'bg-slate-100 text-slate-600 border-slate-200',
      REVIEW: 'bg-amber-100 text-amber-700 border-amber-200',
      REJECTED: 'bg-red-100 text-red-700 border-red-200',
    };
    return (
      <span className={`px-2 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wider ${styles[status] || styles.DRAFT}`}>
        {status}
      </span>
    );
  };

  return (
    <div className="max-w-7xl mx-auto py-10 px-4">
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <h1 className="text-3xl font-extrabold tracking-tight">Moderasi Event</h1>
          <p className="text-slate-500">Kelola dan setujui event yang didaftarkan oleh Organizer.</p>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <input 
              type="text"
              placeholder="Cari event..."
              className="pl-10 pr-4 py-2 border rounded-lg focus:ring-2 focus:ring-emerald-500 outline-none w-64 transition-all"
              onKeyDown={(e: any) => e.key === 'Enter' && fetchEvents()}
              onChange={(e) => setFilter({ ...filter, search: e.target.value })}
            />
          </div>
          <select 
            className="border rounded-lg px-3 py-2 outline-none focus:ring-2 focus:ring-emerald-500 transition-all bg-white"
            onChange={(e) => setFilter({ ...filter, status: e.target.value })}
          >
            <option value="">Semua Status</option>
            <option value="REVIEW">Perlu Review</option>
            <option value="DRAFT">Draft</option>
            <option value="PUBLISHED">Published</option>
            <option value="REJECTED">Rejected</option>
          </select>
        </div>
      </div>

      <div className="bg-white dark:bg-slate-800 rounded-2xl border border-slate-200 dark:border-slate-700 overflow-hidden shadow-sm">
        {loading ? (
          <div className="flex flex-col items-center justify-center py-20">
            <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
            <p className="text-slate-500">Memuat daftar event...</p>
          </div>
        ) : events.length === 0 ? (
          <div className="py-20 text-center text-slate-500">Tidak ada event ditemukan.</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 dark:bg-slate-900/50 border-b dark:border-slate-700">
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 uppercase tracking-wider">Event & EO</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 uppercase tracking-wider">Lokasi & Waktu</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-sm font-bold text-slate-600 uppercase tracking-wider text-right">Aksi</th>
                </tr>
              </thead>
              <tbody className="divide-y dark:divide-slate-700">
                {events.map((event) => (
                  <tr key={event.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-900/50 transition-colors group">
                    <td className="px-6 py-5">
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 dark:text-white group-hover:text-emerald-600 transition-colors">
                          {event.title}
                        </span>
                        <span className="text-xs text-slate-500 flex items-center mt-1">
                          <User className="w-3 h-3 mr-1" /> {event.eo?.companyName || event.eo?.user?.name}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      <div className="flex flex-col text-sm">
                        <span className="flex items-center text-slate-600 dark:text-slate-300">
                          <MapPin className="w-3 h-3 mr-1.5 text-slate-400" /> {event.city}
                        </span>
                        <span className="flex items-center text-slate-500 text-xs mt-1">
                          <Calendar className="w-3 h-3 mr-1.5 text-slate-400" /> 
                          {new Date(event.startDate).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}
                        </span>
                      </div>
                    </td>
                    <td className="px-6 py-5">
                      {getStatusBadge(event.status)}
                    </td>
                    <td className="px-6 py-5 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <Link 
                          href={`/events/${event.slug}`} 
                          target="_blank"
                          className="p-2 text-slate-400 hover:text-emerald-600 transition-colors"
                          title="Lihat Preview"
                        >
                          <ExternalLink className="w-4 h-4" />
                        </Link>
                        
                        {event.status !== 'PUBLISHED' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-emerald-600 hover:bg-emerald-50"
                            onClick={() => handleApprove(event.id)}
                            disabled={processingId === event.id}
                          >
                            {processingId === event.id ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle className="w-4 h-4" />}
                            <span className="ml-1.5 hidden md:inline">Approve</span>
                          </Button>
                        )}
                        
                        {event.status !== 'REJECTED' && (
                          <Button 
                            variant="ghost" 
                            size="sm" 
                            className="text-red-500 hover:bg-red-50"
                            onClick={() => handleReject(event.id)}
                            disabled={processingId === event.id}
                          >
                            <XCircle className="w-4 h-4" />
                            <span className="ml-1.5 hidden md:inline">Reject</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

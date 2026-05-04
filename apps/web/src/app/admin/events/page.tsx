'use client';

import { useState, useEffect } from 'react';
import { useSearchParams } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { 
  CheckCircle, XCircle, Search, 
  Loader2, ExternalLink, Calendar, MapPin, User, MessageSquare, Send
} from 'lucide-react';
import Link from 'next/link';

export default function AdminEventsPage() {
  const searchParams = useSearchParams();
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [processingId, setProcessingId] = useState<string | null>(null);
  const [approveTarget, setApproveTarget] = useState<any | null>(null);
  const [rejectTarget, setRejectTarget] = useState<any | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [discussionTarget, setDiscussionTarget] = useState<any | null>(null);
  const [discussionComments, setDiscussionComments] = useState<any[]>([]);
  const [discussionLoading, setDiscussionLoading] = useState(false);
  const [discussionMessage, setDiscussionMessage] = useState('');
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

  useEffect(() => {
    const openDiscussion = searchParams.get('openDiscussion');
    const eventId = searchParams.get('eventId');
    if (!openDiscussion || !eventId || events.length === 0) return;
    const target = events.find((e) => e.id === eventId);
    if (target) {
      openDiscussionModal(target);
      const next = new URL(window.location.href);
      next.searchParams.delete('openDiscussion');
      next.searchParams.delete('eventId');
      next.searchParams.delete('notifId');
      window.history.replaceState({}, '', next.toString());
    }
  }, [events, searchParams]);

  const openDiscussionModal = async (event: any) => {
    setDiscussionTarget(event);
    setDiscussionLoading(true);
    try {
      const res = await api.get(`/api/events/${event.id}/comments`);
      setDiscussionComments(res.data?.data || []);
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
      setDiscussionComments([]);
    } finally {
      setDiscussionLoading(false);
    }
  };

  const sendDiscussionComment = async () => {
    if (!discussionTarget || !discussionMessage.trim()) return;
    try {
      await api.post(`/api/events/${discussionTarget.id}/comments`, { message: discussionMessage.trim() });
      setDiscussionMessage('');
      const res = await api.get(`/api/events/${discussionTarget.id}/comments`);
      setDiscussionComments(res.data?.data || []);
      toast.showToast('success', 'Komentar terkirim');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const handleApprove = async (id: string) => {
    setProcessingId(id);
    try {
      await api.post(`/api/admin/events/${id}/approve`);
      toast.showToast('success', 'Event berhasil disetujui dan dipublikasikan');
      setApproveTarget(null);
      fetchEvents();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setProcessingId(null);
    }
  };

  const handleReject = async (id: string, reason: string) => {
    const cleanedReason = reason.trim();
    if (!cleanedReason) {
      toast.showToast('error', 'Alasan penolakan wajib diisi');
      return;
    }

    setProcessingId(id);
    try {
      await api.post(`/api/admin/events/${id}/reject`, { reason: cleanedReason });
      toast.showToast('info', 'Event telah ditolak');
      setRejectTarget(null);
      setRejectReason('');
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
                            onClick={() => setApproveTarget(event)}
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
                            onClick={() => {
                              setRejectTarget(event);
                              setRejectReason('');
                            }}
                            disabled={processingId === event.id}
                          >
                            <XCircle className="w-4 h-4" />
                            <span className="ml-1.5 hidden md:inline">Reject</span>
                          </Button>
                        )}
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-blue-600 hover:bg-blue-50"
                          onClick={() => openDiscussionModal(event)}
                        >
                          <MessageSquare className="w-4 h-4" />
                          <span className="ml-1.5 hidden md:inline">Diskusi</span>
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {approveTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => processingId ? null : setApproveTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Setujui Event</h3>
            <p className="mt-2 text-sm text-slate-600">
              Event ini akan dipublikasikan dan bisa diakses publik.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{approveTarget.title}</p>
              <p className="mt-1 text-xs text-slate-500">{approveTarget.city} • {new Date(approveTarget.startDate).toLocaleDateString('id-ID')}</p>
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setApproveTarget(null)}
                disabled={processingId === approveTarget.id}
              >
                Batal
              </Button>
              <Button
                className="bg-emerald-600 hover:bg-emerald-700 text-white"
                onClick={() => handleApprove(approveTarget.id)}
                disabled={processingId === approveTarget.id}
              >
                {processingId === approveTarget.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <CheckCircle className="w-4 h-4 mr-2" />
                    Ya, Approve
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {rejectTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => processingId ? null : setRejectTarget(null)} />
          <div className="relative w-full max-w-md rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Tolak Event</h3>
            <p className="mt-2 text-sm text-slate-600">
              Berikan alasan penolakan yang jelas untuk EO.
            </p>
            <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
              <p className="text-sm font-semibold text-slate-900">{rejectTarget.title}</p>
              <p className="mt-1 text-xs text-slate-500">{rejectTarget.city} • {new Date(rejectTarget.startDate).toLocaleDateString('id-ID')}</p>
            </div>
            <div className="mt-4">
              <label className="mb-2 block text-sm font-medium text-slate-700">Alasan Penolakan</label>
              <textarea
                rows={4}
                value={rejectReason}
                onChange={(e) => setRejectReason(e.target.value)}
                placeholder="Contoh: Data venue belum lengkap, mohon lengkapi alamat dan kapasitas."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-red-400 focus:ring-2 focus:ring-red-100"
                disabled={processingId === rejectTarget.id}
              />
            </div>
            <div className="mt-6 flex justify-end gap-2">
              <Button
                variant="outline"
                onClick={() => setRejectTarget(null)}
                disabled={processingId === rejectTarget.id}
              >
                Batal
              </Button>
              <Button
                className="bg-red-600 hover:bg-red-700 text-white"
                onClick={() => handleReject(rejectTarget.id, rejectReason)}
                disabled={processingId === rejectTarget.id}
              >
                {processingId === rejectTarget.id ? (
                  <>
                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                    Memproses...
                  </>
                ) : (
                  <>
                    <XCircle className="w-4 h-4 mr-2" />
                    Ya, Reject
                  </>
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {discussionTarget && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={() => setDiscussionTarget(null)} />
          <div className="relative w-full max-w-2xl rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
            <h3 className="text-lg font-bold text-slate-900">Diskusi Moderasi Event</h3>
            <p className="mt-1 text-sm text-slate-600">{discussionTarget.title}</p>
            <div className="mt-4 h-72 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-2">
              {discussionLoading ? (
                <div className="flex items-center justify-center py-10 text-slate-500">
                  <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat diskusi...
                </div>
              ) : discussionComments.length === 0 ? (
                <p className="text-sm text-slate-500 text-center py-10">Belum ada diskusi.</p>
              ) : (
                discussionComments.map((c) => (
                  <div key={c.id} className="rounded-lg bg-white border border-slate-200 p-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-semibold text-slate-900">{c.author?.name || 'User'} <span className="text-xs text-slate-500">({c.authorRole})</span></p>
                      <p className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString('id-ID')}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-700 whitespace-pre-wrap">{c.message}</p>
                  </div>
                ))
              )}
            </div>
            <div className="mt-4">
              <textarea
                rows={3}
                value={discussionMessage}
                onChange={(e) => setDiscussionMessage(e.target.value)}
                placeholder="Tulis komentar untuk EO..."
                className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
              />
            </div>
            <div className="mt-4 flex justify-end gap-2">
              <Button variant="outline" onClick={() => setDiscussionTarget(null)}>Tutup</Button>
              <Button className="bg-blue-600 hover:bg-blue-700 text-white" onClick={sendDiscussionComment} disabled={!discussionMessage.trim()}>
                <Send className="w-4 h-4 mr-2" /> Kirim
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

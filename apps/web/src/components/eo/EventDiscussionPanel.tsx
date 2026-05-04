'use client';

import { useEffect, useMemo, useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import { Button, Textarea, useToast } from '@/components/ui';
import { Loader2, MessageSquare, Send, ShieldCheck } from 'lucide-react';

interface EventDiscussionPanelProps {
  eventId: string;
  eventStatus: string;
  onRefresh?: () => void;
}

export function EventDiscussionPanel({ eventId, eventStatus, onRefresh }: EventDiscussionPanelProps) {
  const { user } = useAuthStore();
  const toast = useToast();
  const [comments, setComments] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState('');

  const canSubmitReview = user?.role === 'EO_ADMIN' && eventStatus === 'DRAFT';

  const loadComments = async () => {
    setLoading(true);
    try {
      const res = await api.get(`/api/events/${eventId}/comments`);
      setComments(res.data?.data || []);
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadComments();
  }, [eventId]);

  const submitReview = async () => {
    if (!canSubmitReview || submitting) return;
    setSubmitting(true);
    try {
      await api.post(`/api/events/${eventId}/submit-review`);
      toast.showToast('success', 'Event diajukan ke review. Admin telah dinotifikasi.');
      onRefresh?.();
      await loadComments();
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSubmitting(false);
    }
  };

  const sendComment = async () => {
    const trimmed = message.trim();
    if (!trimmed || sending) return;
    setSending(true);
    try {
      await api.post(`/api/events/${eventId}/comments`, { message: trimmed });
      setMessage('');
      await loadComments();
      toast.showToast('success', 'Komentar terkirim');
    } catch (err: any) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSending(false);
    }
  };

  const statusBadge = useMemo(() => {
    if (eventStatus === 'REVIEW') return 'bg-amber-100 text-amber-700';
    if (eventStatus === 'PUBLISHED') return 'bg-emerald-100 text-emerald-700';
    if (eventStatus === 'REJECTED') return 'bg-red-100 text-red-700';
    return 'bg-slate-100 text-slate-700';
  }, [eventStatus]);

  return (
    <div className="space-y-5 rounded-2xl border border-slate-200 bg-white p-6">
      <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
        <div>
          <h3 className="text-lg font-bold text-slate-900 flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-emerald-600" /> Diskusi Approval
          </h3>
          <p className="text-sm text-slate-500 mt-1">EO dan Admin bisa berdiskusi sebelum keputusan publish.</p>
        </div>
        <div className="flex items-center gap-2">
          <span className={`px-2.5 py-1 rounded-full text-xs font-semibold ${statusBadge}`}>Status: {eventStatus}</span>
          {canSubmitReview && (
            <Button onClick={submitReview} disabled={submitting} className="bg-emerald-600 hover:bg-emerald-700 text-white">
              {submitting ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <ShieldCheck className="w-4 h-4 mr-2" />}
              Ajukan Review
            </Button>
          )}
        </div>
      </div>

      <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 max-h-80 overflow-y-auto space-y-3">
        {loading ? (
          <div className="flex items-center justify-center py-8 text-slate-500">
            <Loader2 className="w-5 h-5 animate-spin mr-2" /> Memuat komentar...
          </div>
        ) : comments.length === 0 ? (
          <p className="text-sm text-slate-500 text-center py-6">Belum ada komentar diskusi.</p>
        ) : (
          comments.map((c) => (
            <div key={c.id} className="rounded-lg bg-white border border-slate-200 p-3">
              <div className="flex items-center justify-between gap-2">
                <p className="text-sm font-semibold text-slate-900">{c.author?.name || 'User'} <span className="text-xs text-slate-500">({c.authorRole})</span></p>
                <p className="text-xs text-slate-500">{new Date(c.createdAt).toLocaleString('id-ID')}</p>
              </div>
              <p className="text-sm text-slate-700 mt-2 whitespace-pre-wrap">{c.message}</p>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <Textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          rows={3}
          placeholder="Tulis komentar untuk admin/EO..."
        />
        <div className="flex justify-end">
          <Button onClick={sendComment} disabled={sending || !message.trim()}>
            {sending ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : <Send className="w-4 h-4 mr-2" />}
            Kirim Komentar
          </Button>
        </div>
      </div>
    </div>
  );
}

'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import {
  ArrowLeft, Loader2, Info, MapPin, Users, Ticket,
  Settings, ExternalLink, Eye, Calendar
} from 'lucide-react';

// Modular Components
import { EventInfoForm } from '@/components/eo/EventInfoForm';
import { VenueForm } from '@/components/eo/VenueForm';
import { LineupForm } from '@/components/eo/LineupForm';
import { RundownForm } from '@/components/eo/RundownForm';
import { TicketForm } from '@/components/eo/TicketForm';
import { EventDiscussionPanel } from '@/components/eo/EventDiscussionPanel';

export default function ManageEventPage() {
  const { id } = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const { user } = useAuthStore();
  
  const [event, setEvent] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [activeTab, setActiveTab] = useState('info');
  const [error, setError] = useState('');

  const isEOAdmin = user?.role === 'EO_ADMIN';

  const fetchFullData = async () => {
    try {
      const res = await api.get(`/api/events/${id}/full`);
      setEvent(res.data);
    } catch (err: any) {
      setError(getApiError(err).error);
      if (err.response?.status === 403) router.push('/dashboard');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (id) fetchFullData();
  }, [id, router]);

  useEffect(() => {
    const tab = searchParams.get('tab');
    if (tab && ['info', 'lokasi', 'lineup', 'rundown', 'tiket', 'diskusi', 'settings'].includes(tab)) {
      setActiveTab(tab);
    }
  }, [searchParams]);

  useEffect(() => {
    if (user && user.role !== 'EO_ADMIN') {
      router.push('/dashboard');
    }
  }, [user, router]);

  const getPublishErrors = (eventData: any) => {
    const errors: string[] = [];
    const title = eventData?.title?.trim();
    const shortDescription = eventData?.shortDescription?.trim();
    const description = eventData?.description?.trim();
    const startDate = eventData?.startDate ? new Date(eventData.startDate) : null;
    const endDate = eventData?.endDate ? new Date(eventData.endDate) : null;
    const venue = eventData?.venues?.[0];
    const categories = Array.isArray(eventData?.categories) ? eventData.categories : [];
    const lineups = Array.isArray(eventData?.lineups) ? eventData.lineups : [];
    const rundowns = Array.isArray(eventData?.rundowns) ? eventData.rundowns : [];
    const posterUrl = eventData?.posterUrl;
    const hasValidPublicTicket = categories.some((c: any) => !c?.isInternal && Number(c?.quota) > 0);
    const now = new Date();

    if (!title) errors.push('Judul event wajib diisi');
    if (!shortDescription) errors.push('Deskripsi singkat wajib diisi');
    if (!description) errors.push('Deskripsi event wajib diisi');
    if (!startDate || !endDate || Number.isNaN(startDate.getTime()) || Number.isNaN(endDate.getTime()) || startDate >= endDate) {
      errors.push('Tanggal event tidak valid');
    }
    if (startDate && !Number.isNaN(startDate.getTime()) && startDate <= now) {
      errors.push('Tanggal mulai event harus di masa depan');
    }
    if (!posterUrl) errors.push('Poster event wajib diisi');
    if (!venue) errors.push('Venue wajib diisi');
    if (lineups.length === 0) errors.push('Minimal 1 lineup wajib dibuat');
    if (rundowns.length === 0) errors.push('Minimal 1 rundown wajib dibuat');
    if (categories.length === 0) errors.push('Minimal 1 kategori tiket wajib dibuat');
    if (!hasValidPublicTicket) errors.push('Minimal 1 tiket publik dengan stok > 0 wajib tersedia');

    return errors;
  };

  const publishErrors = event ? getPublishErrors(event) : [];
  const canSubmitReview = isEOAdmin && event?.status === 'DRAFT' && publishErrors.length === 0;
  const isReviewPending = event?.status === 'REVIEW';

  const handleSubmitReview = async () => {
    if (!event || publishing) return;
    const currentErrors = getPublishErrors(event);
    if (currentErrors.length > 0) {
      setError(currentErrors[0]);
      return;
    }

    setPublishing(true);
    setError('');
    try {
      await api.post(`/api/events/${event.id}/submit-review`);
      await fetchFullData();
    } catch (err: any) {
      const apiErr = getApiError(err) as any;
      const detail = Array.isArray(apiErr?.details) && apiErr.details.length > 0 ? apiErr.details[0] : null;
      setError(detail || apiErr.error || 'Terjadi kesalahan, coba lagi');
    } finally {
      setPublishing(false);
    }
  };

  if (!user || !isEOAdmin || loading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh]">
        <Loader2 className="w-10 h-10 animate-spin text-emerald-600 mb-4" />
        <p className="text-slate-500 animate-pulse">Memuat dashboard event...</p>
      </div>
    );
  }

  if (error || !event) {
    return (
      <div className="max-w-2xl mx-auto py-20 text-center">
        <div className="bg-red-50 text-red-600 p-6 rounded-xl mb-6">
          {error || 'Event tidak ditemukan'}
        </div>
        <Link href="/eo/events" className="text-emerald-600 font-semibold hover:underline">
          Kembali ke Daftar Event
        </Link>
      </div>
    );
  }

  const tabs = [
    { id: 'info', label: 'Info Dasar', icon: Info },
    { id: 'lokasi', label: 'Lokasi', icon: MapPin },
    { id: 'lineup', label: 'Lineup', icon: Users },
    { id: 'rundown', label: 'Rundown', icon: Calendar },
    { id: 'tiket', label: 'Tiket', icon: Ticket },
    { id: 'diskusi', label: 'Diskusi', icon: Info },
    { id: 'settings', label: 'Pengaturan', icon: Settings },
  ];

  return (
    <div className="max-w-6xl mx-auto py-8 px-4">
      {/* Header Section */}
      <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
        <div>
          <Link href="/eo/events" className="text-sm text-slate-500 hover:text-emerald-600 flex items-center mb-2 transition-colors">
            <ArrowLeft className="w-4 h-4 mr-1" /> Dashboard EO
          </Link>
          <h1 className="text-2xl font-bold text-slate-900 dark:text-white">
            {event.title}
          </h1>
          <p className="text-slate-500 flex items-center mt-1">
            <span className={`w-2 h-2 rounded-full mr-2 ${event.status === 'PUBLISHED' ? 'bg-emerald-500' : 'bg-amber-500'}`} />
            Status: {event.status}
          </p>
        </div>
        
        <div className="flex items-center gap-3">
          <Link 
            href={`/events/${event.slug}`} 
            target="_blank"
            className="flex items-center px-4 py-2 bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg font-medium transition-all"
            title={event.status === 'PUBLISHED' ? 'Pratinjau publik' : 'Pratinjau owner sebelum publish'}
          >
            <Eye className="w-4 h-4 mr-2" /> Pratinjau
            <ExternalLink className="w-3 h-3 ml-2 opacity-50" />
          </Link>
          <button
            onClick={handleSubmitReview}
            disabled={!canSubmitReview || isReviewPending || publishing}
            className="px-6 py-2 bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-300 disabled:cursor-not-allowed text-white rounded-lg font-bold shadow-md transition-colors"
          >
            {publishing ? 'Mengajukan...' : isReviewPending ? 'Menunggu Review Admin' : event.status === 'PUBLISHED' ? 'Published' : 'Ajukan Review'}
          </button>
        </div>
      </div>

      {!canSubmitReview && event?.status === 'DRAFT' && publishErrors.length > 0 && (
        <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 p-4 text-sm text-amber-800">
          <p className="font-semibold mb-1">Lengkapi data sebelum ajukan review:</p>
          <p>{publishErrors[0]}</p>
        </div>
      )}

      <div className="flex flex-col lg:flex-row gap-8">
        {/* Sidebar Navigation */}
        <div className="w-full lg:w-64 flex-shrink-0">
          <nav className="flex flex-row lg:flex-col overflow-x-auto lg:overflow-visible gap-1 bg-slate-100/50 dark:bg-slate-900/50 p-1 rounded-xl">
            {tabs.map((tab) => (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                className={`flex items-center px-4 py-3 rounded-lg text-sm font-bold transition-all whitespace-nowrap ${
                  activeTab === tab.id 
                  ? 'bg-white dark:bg-slate-800 text-emerald-600 shadow-sm' 
                  : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800/50 hover:text-slate-700 dark:hover:text-slate-300'
                }`}
              >
                <tab.icon className={`w-4 h-4 mr-3 ${activeTab === tab.id ? 'text-emerald-600' : 'text-slate-400'}`} />
                {tab.label}
              </button>
            ))}
          </nav>
        </div>

        {/* Content Area */}
        <div className="flex-1 min-w-0">
          {activeTab === 'info' && (
            <EventInfoForm eventId={event.id} initialData={event} onUpdate={fetchFullData} />
          )}
          
          {activeTab === 'lokasi' && (
            <VenueForm eventId={event.id} initialData={event.venues?.[0] || {}} onUpdate={fetchFullData} />
          )}
          
          {activeTab === 'lineup' && (
            <LineupForm eventId={event.id} initialData={event.lineups} onUpdate={fetchFullData} />
          )}

          {activeTab === 'rundown' && (
            <RundownForm eventId={event.id} initialData={event.rundowns || []} onUpdate={fetchFullData} />
          )}

          {activeTab === 'tiket' && (
            <TicketForm eventId={event.id} initialData={event.categories} onUpdate={fetchFullData} />
          )}

          {activeTab === 'diskusi' && (
            <EventDiscussionPanel eventId={event.id} eventStatus={event.status} onRefresh={fetchFullData} />
          )}

          {activeTab === 'settings' && (
            <div className="bg-white dark:bg-slate-800 p-8 rounded-xl border border-slate-200 dark:border-slate-700 text-center">
              <Settings className="w-12 h-12 text-slate-300 mx-auto mb-4" />
              <h3 className="text-lg font-bold">Pengaturan Lanjutan</h3>
              <p className="text-slate-500 mb-6">Kelola visibilitas event, hapus event, atau transfer kepemilikan.</p>
              <div className="flex flex-col gap-3 max-w-xs mx-auto">
                <button className="px-4 py-2 border border-red-200 text-red-600 hover:bg-red-50 rounded-lg transition-colors">
                  Hapus Event (Permanen)
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

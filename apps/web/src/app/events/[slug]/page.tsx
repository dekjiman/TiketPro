'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { Button } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { MapPin, Calendar, Clock, ArrowLeft, Ticket, Share2, Heart, Users, List, MapPin as VenueIcon } from 'lucide-react';
import Footer from '@/components/Footer';

interface Event {
  id: string;
  title: string;
  slug: string;
  shortDescription?: string;
  description?: string;
  city: string;
  province?: string;
  startDate: string;
  endDate?: string;
  bannerUrl?: string;
  posterUrl?: string;
  thumbnailUrl?: string;
  images?: { id: string; imageUrl: string; orderIndex: number }[];
  eo?: { companyName?: string; user?: { name: string } };
  venues?: { name: string; address: string; city: string; mapUrl?: string }[];
  categories?: TicketCategory[];
  lineups?: LineupItem[];
  rundowns?: RundownItem[];
}

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  quota: number;
  sold?: number;
  description?: string;
  status: string;
}

interface LineupItem { id: string; artistName: string; photoUrl?: string; role: string; dayIndex?: number; }
interface RundownItem { id: string; title: string; startTime: string; stage?: string; dayIndex?: number; }
type DetailTab = 'about' | 'lineup' | 'schedule' | 'location';

function sanitizePublicEvent(payload: any): Event {
  return {
    id: payload?.id,
    title: payload?.title,
    slug: payload?.slug,
    shortDescription: payload?.shortDescription,
    description: payload?.description,
    city: payload?.city,
    province: payload?.province,
    startDate: payload?.startDate,
    endDate: payload?.endDate,
    bannerUrl: payload?.bannerUrl,
    posterUrl: payload?.posterUrl,
    thumbnailUrl: payload?.thumbnailUrl,
    images: Array.isArray(payload?.images)
      ? payload.images.map((img: any) => ({ id: img.id, imageUrl: img.imageUrl, orderIndex: img.orderIndex }))
      : [],
    eo: payload?.eo ? { companyName: payload.eo.companyName, user: payload.eo.user ? { name: payload.eo.user.name } : undefined } : undefined,
    venues: Array.isArray(payload?.venues)
      ? payload.venues.map((v: any) => ({ name: v.name, address: v.address, city: v.city, mapUrl: v.mapUrl }))
      : [],
    categories: Array.isArray(payload?.categories)
      ? payload.categories.map((c: any) => ({
          id: c.id,
          name: c.name,
          price: c.price,
          quota: c.quota,
          sold: c.sold,
          description: c.description,
          status: c.status,
        }))
      : [],
    lineups: Array.isArray(payload?.lineups)
      ? payload.lineups.map((l: any) => ({ id: l.id, artistName: l.artistName, photoUrl: l.photoUrl, role: l.role, dayIndex: l.dayIndex }))
      : [],
    rundowns: Array.isArray(payload?.rundowns)
      ? payload.rundowns.map((r: any) => ({ id: r.id, title: r.title, startTime: r.startTime, stage: r.stage, dayIndex: r.dayIndex }))
      : [],
  };
}

function normalizeMapUrl(raw?: string) {
  if (!raw) return '';
  const value = raw.trim();
  if (!value) return '';

  // Support pasted embed iframe by extracting src.
  const iframeMatch = value.match(/<iframe[^>]*\ssrc=["']([^"']+)["']/i);
  const extracted = iframeMatch?.[1]?.trim() || value;

  if (/^https?:\/\//i.test(extracted)) return extracted;
  if (/^www\./i.test(extracted)) return `https://${extracted}`;
  return '';
}

function resolveVenueMapHref(venue?: { name?: string; address?: string; city?: string; mapUrl?: string }) {
  const normalized = normalizeMapUrl(venue?.mapUrl);
  if (!normalized) return '';

  // Google embed links only work inside iframe, so convert to a normal maps URL.
  if (normalized.includes('/maps/embed')) {
    const query = [venue?.name, venue?.address, venue?.city].filter(Boolean).join(', ').trim();
    if (query) {
      return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(query)}`;
    }
    return 'https://www.google.com/maps';
  }

  return normalized;
}

function formatDate(date: Date) {
  return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function formatNumberWithComma(value: number) {
  return value.toLocaleString('en-US');
}

function TicketCard({ category, onSelect }: { category: TicketCategory; onSelect: () => void }) {
  const isSoldOut = category.status === 'SOLD_OUT';
  const isUpcoming = category.status === 'UPCOMING';
  const isClosed = category.status === 'CLOSED' || category.status?.toLowerCase() === 'close';
  const available = category.quota - (category.sold || 0);
  
  let badgeClass = 'bg-green-100 text-green-700';
  let badgeText = `${formatNumberWithComma(available)} tersedia`;
  
  if (isSoldOut) {
    badgeClass = 'bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-300';
    badgeText = 'Stok Habis';
  } else if (isUpcoming) {
    badgeClass = 'bg-yellow-100 text-yellow-700';
    badgeText = 'Coming Soon';
  } else if (isClosed) {
    badgeClass = 'bg-slate-100 text-slate-600';
    badgeText = 'Penjualan Ditutup';
  } else if (available <= 10) {
    badgeClass = 'bg-red-100 text-red-600';
    badgeText = `Hanya ${formatNumberWithComma(available)} tersisa!`;
  }
  
  return (
    <div className="p-4 bg-[var(--surface)] rounded-xl border border-[var(--border)] shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-[var(--text)]">{category.name}</h3>
          {category.description && <p className="text-sm text-[var(--muted)] mt-1 line-clamp-1">{category.description}</p>}
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeClass}`}>{badgeText}</span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xl font-bold text-emerald-600">
          {category.price === 0 ? 'FREE' : `Rp${category.price.toLocaleString('id-ID')}`}
        </p>
        <Button
          onClick={onSelect}
          disabled={isSoldOut || isUpcoming || isClosed}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 px-6 py-2.5 rounded-xl font-semibold"
        >
          {isSoldOut ? 'Habis' : isUpcoming ? 'Soon' : isClosed ? 'Ditutup' : 'Beli'}
        </Button>
      </div>
    </div>
  );
}

function LineupCard({ lineup }: { lineup: LineupItem }) {
  return (
    <div className="text-center p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-slate-200 dark:bg-slate-700 overflow-hidden">
        {lineup.photoUrl ? (
          <Image src={lineup.photoUrl} alt={lineup.artistName} width={64} height={64} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-slate-400 dark:text-slate-500">
            {lineup.artistName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <p className="font-semibold text-[var(--text)] text-sm truncate">{lineup.artistName}</p>
      <p className="text-xs text-[var(--muted)] mt-0.5">{lineup.role}</p>
    </div>
  );
}

export default function EventDetailPage() {
  const { slug } = useParams();
  const router = useRouter();
  const { isLoggedIn } = useAuthStore();
  const [event, setEvent] = useState<Event | null>(null);
  const [moreEvents, setMoreEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState<DetailTab>('about');
  const [isLoved, setIsLoved] = useState(false);
  const [activeImageIndex, setActiveImageIndex] = useState(0);

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await api.get(`/api/events/${slug}`);
        const sanitized = sanitizePublicEvent(res.data);
        setEvent(sanitized);
        
        // Fetch more events
        const moreRes = await api.get(`/api/events?status=PUBLISHED&limit=5`);
        const allEvents = moreRes.data.data || moreRes.data.events || [];
        // Filter out current event
        const filtered = allEvents
          .map((item: any) => sanitizePublicEvent(item))
          .filter((e: any) => e.id !== sanitized.id)
          .slice(0, 5);
        setMoreEvents(filtered);
      } catch { setError('Event tidak ditemukan'); } 
      finally { setLoading(false); }
    };
    if (slug) fetchEvent();
  }, [slug]);

  useEffect(() => {
    const fetchFavoriteStatus = async () => {
      if (!event?.slug || !isLoggedIn) {
        setIsLoved(false);
        return;
      }

      try {
        const res = await api.get(`/api/events/${event.slug}/favorite-status`);
        setIsLoved(Boolean(res.data?.liked));
      } catch {
        setIsLoved(false);
      }
    };

    fetchFavoriteStatus();
  }, [event?.slug, isLoggedIn]);

  useEffect(() => {
    if (!event) return;
    const images = [event.bannerUrl, event.posterUrl, event.thumbnailUrl].filter(Boolean);
    if (images.length <= 1) {
      setActiveImageIndex(0);
      return;
    }
    setActiveImageIndex(prev => (prev >= images.length ? 0 : prev));
  }, [event?.bannerUrl, event?.posterUrl, event?.thumbnailUrl]);

  useEffect(() => {
    if (!event) return;
    const images = [event.bannerUrl, event.posterUrl, event.thumbnailUrl].filter(Boolean);
    if (images.length <= 1) return;

    const timer = setInterval(() => {
      setActiveImageIndex(prev => (prev + 1) % images.length);
    }, 4000);

    return () => clearInterval(timer);
  }, [event?.bannerUrl, event?.posterUrl, event?.thumbnailUrl]);

  const handleBuyTickets = () => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/checkout/${slug}`);
      return;
    }
    router.push(`/checkout/${slug}`);
  };

  const handleShare = async () => {
    if (!event) return;
    const shareUrl = typeof window !== 'undefined' ? window.location.href : `/events/${event.slug}`;
    const shareData = {
      title: event.title,
      text: event.shortDescription || 'Lihat event ini di TiketPro',
      url: shareUrl,
    };

    try {
      if (typeof navigator !== 'undefined' && navigator.share) {
        await navigator.share(shareData);
        return;
      }
    } catch {
      // Ignore and fallback to clipboard.
    }

    try {
      if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(shareUrl);
        alert('Link event berhasil disalin');
        return;
      }
    } catch {
      // Ignore and continue to manual fallback.
    }

    try {
      if (typeof window !== 'undefined') {
        window.prompt('Salin link event ini:', shareUrl);
        return;
      }
    } catch {
      // no-op
    }

    alert('Gagal membagikan link event');
  };

  const handleLove = async () => {
    if (!event) return;
    if (!isLoggedIn) {
      router.push(`/login?redirect=/events/${event.slug}`);
      return;
    }

    try {
      const res = await api.post(`/api/events/${event.slug}/favorite`);
      setIsLoved(Boolean(res.data?.liked));
    } catch {
      alert('Gagal menyimpan favorit');
    }
  };



  if (loading) return (
    <div className="min-h-screen bg-[var(--bg)]">
      <div className="h-14 bg-[var(--surface)] border-b border-[var(--border)] animate-pulse" />
      <div className="p-4 space-y-4">
        <div className="h-72 bg-slate-200 dark:bg-slate-800 rounded-2xl" />
        <div className="h-10 bg-gray-300 rounded w-3/4" />
        <div className="space-y-3">
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
          <div className="h-24 bg-slate-200 dark:bg-slate-800 rounded-xl" />
        </div>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen bg-[var(--bg)] flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-xl font-bold text-[var(--text)] mb-2">Event Tidak Ditemukan</h1>
        <Link href="/"><Button>Ke Beranda</Button></Link>
      </div>
    </div>
  );

  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const eventImages = Array.from(
    new Set(
      [
        ...(event.images || []).map(img => img.imageUrl),
        event.bannerUrl,
        event.posterUrl,
        event.thumbnailUrl,
      ].filter(Boolean) as string[]
    )
  );
  const fallbackImage = 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1200&q=80';
  const galleryImages = eventImages.length > 0 ? eventImages : [fallbackImage];
  const imageUrl = galleryImages[activeImageIndex] || fallbackImage;
  const isActiveMediaVideo = /(\.mp4|\.webm|\.ogg)(\?|$)/i.test(imageUrl);
  const eoName = event.eo?.companyName || event.eo?.user?.name || 'Event Organizer';
  const venue = event.venues?.[0];
  const venueMapUrl = resolveVenueMapHref(venue);
  
  const linedays = event.lineups?.reduce((acc: Record<number, LineupItem[]>, l) => {
    const day = l.dayIndex || 1;
    if (!acc[day]) acc[day] = [];
    acc[day].push(l);
    return acc;
  }, {}) || {};
  
  const rundowndays = event.rundowns?.reduce((acc: Record<number, RundownItem[]>, r) => {
    const day = r.dayIndex || 1;
    if (!acc[day]) acc[day] = [];
    acc[day].push(r);
    return acc;
  }, {}) || {};
  const hasBuyableCategory = (event.categories || []).some(cat => {
    const status = cat.status;
    return status !== 'SOLD_OUT' && status !== 'UPCOMING' && status !== 'CLOSED' && status?.toLowerCase() !== 'close';
  });

  // ===== DESKTOP LAYOUT =====
  return (
    <div className="min-h-screen bg-[var(--bg)]">
      {/* ===== HEADER ===== */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-[color:var(--surface)]/95 backdrop-blur-sm border-b border-[var(--border)] z-50">
        <div className="flex items-center justify-between h-full px-4 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2 text-[var(--muted)] hover:text-[var(--text)]">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Kembali</span>
          </Link>
          <Link href="/" className="text-xl font-bold text-emerald-600">TiketPro</Link>
          <div className="flex items-center gap-2">
            <button
              onClick={handleShare}
              aria-label="Bagikan event"
              className="p-2 text-[var(--muted)] hover:text-[var(--text)]"
            >
              <Share2 className="w-5 h-5" />
            </button>
            <button
              onClick={handleLove}
              aria-label={isLoved ? 'Hapus dari favorit' : 'Simpan ke favorit'}
              className={`p-2 ${isLoved ? 'text-red-500' : 'text-[var(--muted)] hover:text-red-500'}`}
            >
              <Heart className={`w-5 h-5 ${isLoved ? 'fill-current' : ''}`} />
            </button>
          </div>
        </div>
      </header>

      {/* ===== MAIN CONTENT (2 COLUMNS DESKTOP) ===== */}
      <div className="pt-14">
        <div className="max-w-7xl mx-auto px-4 py-6 lg:px-6">
          <div className="flex flex-col lg:flex-row gap-6 lg:gap-8">
            
            {/* ===== LEFT (70%): BANNER + CONTENT ===== */}
            <div className="w-full lg:w-[70%]">
              {/* BANNER IMAGE */}
              <div className="relative h-56 sm:h-72 lg:h-80 xl:h-96 bg-slate-200 dark:bg-slate-800 rounded-2xl overflow-hidden mb-6">
                {isActiveMediaVideo ? (
                  <video
                    src={imageUrl}
                    className="absolute inset-0 w-full h-full object-cover"
                    controls
                    muted
                    playsInline
                  />
                ) : (
                  <Image src={imageUrl} alt={event.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" priority />
                )}
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
                {galleryImages.length > 1 && (
                  <>
                    <button
                      type="button"
                      aria-label="Gambar sebelumnya"
                      onClick={() => setActiveImageIndex(prev => (prev - 1 + galleryImages.length) % galleryImages.length)}
                      className="absolute left-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/55"
                    >
                      ‹
                    </button>
                    <button
                      type="button"
                      aria-label="Gambar berikutnya"
                      onClick={() => setActiveImageIndex(prev => (prev + 1) % galleryImages.length)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 z-10 h-9 w-9 rounded-full bg-black/40 text-white hover:bg-black/55"
                    >
                      ›
                    </button>
                    <div className="absolute bottom-3 left-1/2 z-10 flex -translate-x-1/2 gap-2">
                      {galleryImages.map((img, idx) => (
                        <button
                          key={`${img}-${idx}`}
                          type="button"
                          aria-label={`Pilih gambar ${idx + 1}`}
                          onClick={() => setActiveImageIndex(idx)}
                          className={`h-2.5 w-2.5 rounded-full transition-all ${
                            idx === activeImageIndex ? 'bg-white' : 'bg-white/55 hover:bg-white/80'
                          }`}
                        />
                      ))}
                    </div>
                  </>
                )}
              </div>
              
              {/* TITLE & INFO */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-[var(--text)] mb-4 leading-tight">{event.title}</h1>
                <div className="flex flex-wrap gap-4 text-[var(--muted)]">
                  <span className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-emerald-100 flex items-center justify-center"><Calendar className="w-4 h-4 text-emerald-600" /></div>
                    <span className="font-medium">{formatDate(startDate)}{endDate && ` - ${formatDate(endDate)}`}</span>
                  </span>
                  <span className="flex items-center gap-2">
                    <div className="w-8 h-8 rounded-full bg-blue-100 flex items-center justify-center"><MapPin className="w-4 h-4 text-blue-600" /></div>
                    <span className="font-medium">{event.city}{event.province && `, ${event.province}`}</span>
                  </span>
                  {venue && (
                    <span className="flex items-center gap-2">
                      <div className="w-8 h-8 rounded-full bg-red-100 flex items-center justify-center"><VenueIcon className="w-4 h-4 text-red-600" /></div>
                      <span className="font-medium">{venue.name}</span>
                    </span>
                  )}
                </div>
                <p className="text-sm text-[var(--muted)] mt-3">Diselesaikan oleh <span className="font-semibold text-[var(--text)]">{eoName}</span></p>
              </div>

              {/* DESCRIPTION */}
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-3 sm:p-4 shadow-sm mb-4 sticky top-14 z-30 lg:static">
                <div className="flex gap-2 overflow-x-auto">
                  <button
                    onClick={() => setActiveTab('about')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'about' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    Tentang Event
                  </button>
                  <button
                    onClick={() => setActiveTab('lineup')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'lineup' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    Lineup
                  </button>
                  <button
                    onClick={() => setActiveTab('schedule')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'schedule' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    Jadwal
                  </button>
                  <button
                    onClick={() => setActiveTab('location')}
                    className={`px-4 py-2 rounded-lg text-sm font-semibold whitespace-nowrap ${activeTab === 'location' ? 'bg-emerald-600 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                  >
                    Lokasi
                  </button>
                </div>
              </div>

              {activeTab === 'about' && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                    <List className="w-5 h-5 text-blue-600" />Tentang Event
                  </h2>
                  {event.shortDescription && <p className="font-semibold text-gray-800 mb-3">{event.shortDescription}</p>}
                  {event.description && (
                    <div className="text-[var(--muted)] leading-relaxed space-y-2">
                      {event.description.split('\n').map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  )}
                  {!event.shortDescription && !event.description && (
                    <p className="text-[var(--muted)] text-center py-6">Deskripsi event belum tersedia</p>
                  )}
                </div>
              )}

              {/* LINEUP */}
              {activeTab === 'lineup' && (
              <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />Lineup
                </h2>
                {event.lineups?.length ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 gap-3">
                    {event.lineups.map(l => <LineupCard key={l.id} lineup={l} />)}
                  </div>
                ) : (
                  <p className="text-[var(--muted)] text-center py-6">Lineup akan diumumkan</p>
                )}
              </div>
              )}

              {/* RUNDOWN */}
              {activeTab === 'schedule' && (event.rundowns?.length ? (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />Jadwal
                  </h2>
                  <div className="space-y-4">
                    {Object.entries(rundowndays).map(([day, items]) => (
                      <div key={day}>
                        <p className="font-semibold text-[var(--muted)] text-sm mb-2">Hari {day}</p>
                        <div className="space-y-2">
                          {items.map(r => (
                            <div key={r.id} className="flex items-center gap-4 p-3 bg-slate-50 dark:bg-slate-800 rounded-xl">
                              <p className="font-bold text-emerald-600 min-w-[70px]">{formatTime(new Date(r.startTime))}</p>
                              <p className="flex-1 font-medium text-[var(--text)]">{r.title}</p>
                              {r.stage && <p className="text-sm text-[var(--muted)]">{r.stage}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />Jadwal
                  </h2>
                  <p className="text-[var(--muted)] text-center py-6">Jadwal belum tersedia</p>
                </div>
              ))}

              {/* VENUE */}
              {activeTab === 'location' && venue && (
                <div className="bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                    <VenueIcon className="w-5 h-5 text-red-600" />Lokasi
                  </h2>
                  <div className="p-4 bg-slate-50 dark:bg-slate-800 rounded-xl">
                    <p className="font-semibold text-[var(--text)]">{venue.name}</p>
                    <p className="text-[var(--muted)] mt-1">{venue.address}</p>
                    <p className="text-[var(--muted)]">{venue.city}</p>
                    {venueMapUrl && (
                      <a href={venueMapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 font-medium mt-3 hover:underline">
                        <MapPin className="w-4 h-4" />Lihat di Peta
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* ===== MORE EVENTS ===== */}
              {moreEvents.length > 0 && (
                <div className="mb-6">
                  <h2 className="font-bold text-lg text-[var(--text)] mb-4">Event Lainnya</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:m-0 md:p-0">
                    {moreEvents.map((ev) => (
                      <Link key={ev.id} href={`/events/${ev.slug || ev.id}`} className="flex-shrink-0 w-64 group">
                        <div className="bg-[var(--surface)] border border-[var(--border)] rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="relative h-32 bg-slate-200 dark:bg-slate-800">
                            <Image 
                              src={ev.bannerUrl || ev.posterUrl || ev.thumbnailUrl || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&q=80'} 
                              alt={ev.title} 
                              fill 
                              className="object-cover"
                              sizes="256px"
                            />
                          </div>
                          <div className="p-3">
                            <h3 className="font-semibold text-[var(--text)] text-sm mb-1 line-clamp-1">{ev.title}</h3>
                            <div className="text-xs text-[var(--muted)] flex items-center gap-1">
                              <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{formatDate(new Date(ev.startDate))}</span>
                            </div>
                            <div className="text-xs text-[var(--muted)] flex items-center gap-0.5">
                              <MapPin className="w-3 h-3" />{ev.city}
                            </div>
                          </div>
                        </div>
                      </Link>
                    ))}
                  </div>
                </div>
              )}
            </div>

            {/* ===== RIGHT (30%): TICKET STICKY ===== */}
            <div className="w-full lg:w-[30%]">
              <div id="ticket-section" className="lg:sticky lg:top-20 bg-[var(--surface)] border border-[var(--border)] rounded-2xl p-5 shadow-sm">
                <h2 className="font-bold text-lg text-[var(--text)] mb-4 flex items-center gap-2">
                  <Ticket className="w-5 h-5 text-emerald-600" />Pilih Tiket
                </h2>
                {event.categories?.length ? (
                  <div className="space-y-3">
                    {event.categories.map(cat => (
                      <TicketCard key={cat.id} category={cat} onSelect={handleBuyTickets} />
                    ))}
                  </div>
                ) : (
                  <div className="py-10 text-center">
                    <Ticket className="w-12 h-12 text-gray-300 mx-auto mb-3" />
                    <p className="text-[var(--muted)]">Tiket belum tersedia</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE STICKY CTA ===== */}
      {event.categories?.length ? (
        <div className="fixed bottom-0 left-0 right-0 bg-[var(--surface)] border-t border-[var(--border)] p-4 z-40 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-[var(--muted)]">Mulai dari</p>
              <p className="font-bold text-lg text-[var(--text)]">
                {event.categories?.[0]?.price === 0 
                  ? 'FREE' 
                  : event.categories?.[0] 
                    ? `Rp${Math.min(...event.categories.map(c => c.price)).toLocaleString('id-ID')}` 
                    : '-'}
              </p>
            </div>
            <Button
              onClick={handleBuyTickets}
              disabled={!hasBuyableCategory}
              className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 font-bold px-8 py-3 rounded-xl"
            >
              {hasBuyableCategory ? 'Beli Tiket' : 'Tiket Ditutup'}
            </Button>
          </div>
        </div>
      ) : null}
      
      {/* Spacer for mobile CTA */}
      <div className="h-20 lg:hidden" />

      {/* Footer */}
      <div className="mt-8" />
      <Footer />
    </div>
  );
}

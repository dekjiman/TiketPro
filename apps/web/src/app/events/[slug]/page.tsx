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

function formatDate(date: Date) {
  return date.toLocaleDateString('id-ID', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' });
}

function formatTime(date: Date) {
  return date.toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' });
}

function TicketCard({ category, onSelect }: { category: TicketCategory; onSelect: () => void }) {
  const isSoldOut = category.status === 'SOLD_OUT';
  const isUpcoming = category.status === 'UPCOMING';
  const available = category.quota - (category.sold || 0);
  
  let badgeClass = 'bg-green-100 text-green-700';
  let badgeText = `${available} tersedia`;
  
  if (isSoldOut) {
    badgeClass = 'bg-gray-100 text-gray-500';
    badgeText = 'Stok Habis';
  } else if (isUpcoming) {
    badgeClass = 'bg-yellow-100 text-yellow-700';
    badgeText = 'Coming Soon';
  } else if (available <= 10) {
    badgeClass = 'bg-red-100 text-red-600';
    badgeText = `Hanya ${available} tersisa!`;
  }
  
  return (
    <div className="p-4 bg-white rounded-xl border border-gray-100 shadow-sm hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between mb-3">
        <div>
          <h3 className="font-semibold text-gray-900">{category.name}</h3>
          {category.description && <p className="text-sm text-gray-500 mt-1 line-clamp-1">{category.description}</p>}
        </div>
        <span className={`px-2 py-1 text-xs font-medium rounded-full ${badgeClass}`}>{badgeText}</span>
      </div>
      <div className="flex items-center justify-between">
        <p className="text-xl font-bold text-emerald-600">
          {category.price === 0 ? 'FREE' : `Rp${category.price.toLocaleString('id-ID')}`}
        </p>
        <Button
          onClick={onSelect}
          disabled={isSoldOut || isUpcoming}
          className="bg-emerald-500 hover:bg-emerald-600 disabled:bg-gray-300 px-6 py-2.5 rounded-xl font-semibold"
        >
          {isSoldOut ? 'Habis' : isUpcoming ? 'Soon' : 'Beli'}
        </Button>
      </div>
    </div>
  );
}

function LineupCard({ lineup }: { lineup: LineupItem }) {
  return (
    <div className="text-center p-4 bg-gray-50 rounded-xl">
      <div className="w-16 h-16 mx-auto mb-3 rounded-full bg-gray-200 overflow-hidden">
        {lineup.photoUrl ? (
          <Image src={lineup.photoUrl} alt={lineup.artistName} width={64} height={64} className="w-full h-full object-cover" />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-2xl font-bold text-gray-400">
            {lineup.artistName.slice(0, 1).toUpperCase()}
          </div>
        )}
      </div>
      <p className="font-semibold text-gray-900 text-sm truncate">{lineup.artistName}</p>
      <p className="text-xs text-gray-500 mt-0.5">{lineup.role}</p>
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

  useEffect(() => {
    const fetchEvent = async () => {
      try {
        const res = await api.get(`/api/events/${slug}`);
        setEvent(res.data);
        
        // Fetch more events
        const moreRes = await api.get(`/api/events?status=PUBLISHED&limit=5`);
        const allEvents = moreRes.data.events || [];
        // Filter out current event
        const filtered = allEvents.filter((e: any) => e.id !== res.data.id).slice(0, 5);
        setMoreEvents(filtered);
      } catch { setError('Event tidak ditemukan'); } 
      finally { setLoading(false); }
    };
    if (slug) fetchEvent();
  }, [slug]);

  const handleBuyTickets = () => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/checkout/${slug}`);
      return;
    }
    router.push(`/checkout/${slug}`);
  };



  if (loading) return (
    <div className="min-h-screen bg-gray-50">
      <div className="h-14 bg-white border-b animate-pulse" />
      <div className="p-4 space-y-4">
        <div className="h-72 bg-gray-200 rounded-2xl" />
        <div className="h-10 bg-gray-300 rounded w-3/4" />
        <div className="space-y-3">
          <div className="h-24 bg-gray-200 rounded-xl" />
          <div className="h-24 bg-gray-200 rounded-xl" />
        </div>
      </div>
    </div>
  );

  if (error || !event) return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center">
      <div className="text-center p-8">
        <h1 className="text-xl font-bold text-gray-900 mb-2">Event Tidak Ditemukan</h1>
        <Link href="/"><Button>Ke Beranda</Button></Link>
      </div>
    </div>
  );

  const startDate = new Date(event.startDate);
  const endDate = event.endDate ? new Date(event.endDate) : null;
  const imageUrl = (event.bannerUrl || event.posterUrl || event.thumbnailUrl) || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=1200&q=80';
  const eoName = event.eo?.companyName || event.eo?.user?.name || 'Event Organizer';
  const venue = event.venues?.[0];
  
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

  // ===== DESKTOP LAYOUT =====
  return (
    <div className="min-h-screen bg-gray-50">
      {/* ===== HEADER ===== */}
      <header className="fixed top-0 left-0 right-0 h-14 bg-white/95 backdrop-blur-sm border-b border-gray-200 z-50">
        <div className="flex items-center justify-between h-full px-4 max-w-7xl mx-auto">
          <Link href="/" className="flex items-center gap-2 text-gray-600 hover:text-gray-900">
            <ArrowLeft className="w-5 h-5" />
            <span className="text-sm font-medium">Kembali</span>
          </Link>
          <Link href="/" className="text-xl font-bold text-emerald-600">TiketPro</Link>
          <div className="flex items-center gap-2">
            <button className="p-2 text-gray-400 hover:text-gray-600"><Share2 className="w-5 h-5" /></button>
            <button className="p-2 text-gray-400 hover:text-red-500"><Heart className="w-5 h-5" /></button>
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
              <div className="relative h-56 sm:h-72 lg:h-80 xl:h-96 bg-gray-200 rounded-2xl overflow-hidden mb-6">
                <Image src={imageUrl} alt={event.title} fill className="object-cover" sizes="(max-width: 1024px) 100vw, 70vw" priority />
                <div className="absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-transparent" />
              </div>
              
              {/* TITLE & INFO */}
              <div className="mb-6">
                <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 mb-4 leading-tight">{event.title}</h1>
                <div className="flex flex-wrap gap-4 text-gray-600">
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
                <p className="text-sm text-gray-500 mt-3">Diselesaikan oleh <span className="font-semibold text-gray-900">{eoName}</span></p>
              </div>

              {/* DESCRIPTION */}
              {(event.shortDescription || event.description) && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                    <List className="w-5 h-5 text-blue-600" />Tentang Event
                  </h2>
                  {event.shortDescription && <p className="font-semibold text-gray-800 mb-3">{event.shortDescription}</p>}
                  {event.description && (
                    <div className="text-gray-600 leading-relaxed space-y-2">
                      {event.description.split('\n').map((para, i) => <p key={i}>{para}</p>)}
                    </div>
                  )}
                </div>
              )}

              {/* LINEUP */}
              <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                  <Users className="w-5 h-5 text-purple-600" />Lineup
                </h2>
                {event.lineups?.length ? (
                  <div className="grid grid-cols-3 sm:grid-cols-4 md:grid-cols-5 lg:grid-cols-4 gap-3">
                    {event.lineups.map(l => <LineupCard key={l.id} lineup={l} />)}
                  </div>
                ) : (
                  <p className="text-gray-500 text-center py-6">Lineup akan diumumkan</p>
                )}
              </div>

              {/* RUNDOWN */}
              {event.rundowns?.length ? (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />Jadwal
                  </h2>
                  <div className="space-y-4">
                    {Object.entries(rundowndays).map(([day, items]) => (
                      <div key={day}>
                        <p className="font-semibold text-gray-500 text-sm mb-2">Hari {day}</p>
                        <div className="space-y-2">
                          {items.map(r => (
                            <div key={r.id} className="flex items-center gap-4 p-3 bg-gray-50 rounded-xl">
                              <p className="font-bold text-emerald-600 min-w-[70px]">{formatTime(new Date(r.startTime))}</p>
                              <p className="flex-1 font-medium text-gray-900">{r.title}</p>
                              {r.stage && <p className="text-sm text-gray-500">{r.stage}</p>}
                            </div>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ) : (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                    <Clock className="w-5 h-5 text-orange-600" />Jadwal
                  </h2>
                  <p className="text-gray-500 text-center py-6">Jadwal belum tersedia</p>
                </div>
              )}

              {/* VENUE */}
              {venue && (
                <div className="bg-white rounded-2xl p-5 sm:p-6 shadow-sm mb-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
                    <VenueIcon className="w-5 h-5 text-red-600" />Lokasi
                  </h2>
                  <div className="p-4 bg-gray-50 rounded-xl">
                    <p className="font-semibold text-gray-900">{venue.name}</p>
                    <p className="text-gray-600 mt-1">{venue.address}</p>
                    <p className="text-gray-600">{venue.city}</p>
                    {venue.mapUrl && (
                      <a href={venue.mapUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-emerald-600 font-medium mt-3 hover:underline">
                        <MapPin className="w-4 h-4" />Lihat di Peta
                      </a>
                    )}
                  </div>
                </div>
              )}

              {/* ===== MORE EVENTS ===== */}
              {moreEvents.length > 0 && (
                <div className="mb-6">
                  <h2 className="font-bold text-lg text-gray-900 mb-4">Event Lainnya</h2>
                  <div className="flex gap-4 overflow-x-auto pb-4 -mx-4 px-4 md:m-0 md:p-0">
                    {moreEvents.map((ev) => (
                      <Link key={ev.id} href={`/events/${ev.slug || ev.id}`} className="flex-shrink-0 w-64 group">
                        <div className="bg-white rounded-xl shadow-sm overflow-hidden hover:shadow-lg transition-shadow">
                          <div className="relative h-32 bg-gray-200">
                            <Image 
                              src={ev.bannerUrl || ev.posterUrl || ev.thumbnailUrl || 'https://images.unsplash.com/photo-1540039155733-5bb30b53aa14?w=400&q=80'} 
                              alt={ev.title} 
                              fill 
                              className="object-cover"
                              sizes="256px"
                            />
                          </div>
                          <div className="p-3">
                            <h3 className="font-semibold text-gray-900 text-sm mb-1 line-clamp-1">{ev.title}</h3>
                            <div className="text-xs text-gray-500 flex items-center gap-1">
                              <span className="flex items-center gap-0.5"><Calendar className="w-3 h-3" />{formatDate(new Date(ev.startDate))}</span>
                            </div>
                            <div className="text-xs text-gray-500 flex items-center gap-0.5">
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
              <div id="ticket-section" className="lg:sticky lg:top-20 bg-white rounded-2xl p-5 shadow-sm">
                <h2 className="font-bold text-lg text-gray-900 mb-4 flex items-center gap-2">
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
                    <p className="text-gray-500">Tiket belum tersedia</p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ===== MOBILE STICKY CTA ===== */}
      {event.categories?.length ? (
        <div className="fixed bottom-0 left-0 right-0 bg-white border-t border-gray-200 p-4 z-40 lg:hidden">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-gray-500">Mulai dari</p>
              <p className="font-bold text-lg text-gray-900">
                {event.categories?.[0]?.price === 0 
                  ? 'FREE' 
                  : event.categories?.[0] 
                    ? `Rp${Math.min(...event.categories.map(c => c.price)).toLocaleString('id-ID')}` 
                    : '-'}
              </p>
            </div>
            <Button onClick={handleBuyTickets} className="bg-emerald-500 hover:bg-emerald-600 font-bold px-8 py-3 rounded-xl">
              Beli Tiket
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
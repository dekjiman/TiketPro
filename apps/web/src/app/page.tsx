'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import Image from 'next/image';
import { api } from '@/lib/api';
import { Button, Input } from '@/components/ui';
import { MapPin, Calendar, Search, ChevronDown, Star } from 'lucide-react';
import Footer from '@/components/Footer';
import { PublicNavbar } from '@/components/PublicNavbar';

interface Event {
  title: string;
  slug: string;
  city: string;
  startDate: string;
  bannerUrl?: string;
  thumbnailUrl?: string;
  lowestPrice?: number;
}

function SkeletonCard() {
  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden animate-pulse">
      <div className="h-48 bg-slate-200"></div>
      <div className="p-4 space-y-3">
        <div className="h-4 bg-slate-200 rounded w-3/4"></div>
        <div className="h-3 bg-slate-200 rounded w-1/2"></div>
        <div className="h-3 bg-slate-200 rounded w-1/3"></div>
      </div>
    </div>
  );
}

function EventCard({ event }: { event: Event }) {
  const imageUrl = event.bannerUrl || event.thumbnailUrl || '/placeholder-event.jpg';
  const date = new Date(event.startDate).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  });

  return (
    <Link href={`/events/${event.slug}`} className="group">
      <div className="bg-white rounded-lg shadow-sm border border-slate-200 overflow-hidden hover:shadow-lg transition-all duration-200 group-hover:scale-[1.02]">
        <div className="relative h-48 bg-slate-100">
          <Image
            src={imageUrl}
            alt={event.title}
            fill
            className="object-cover"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        </div>
        <div className="p-4">
          <h3 className="font-semibold text-slate-900 mb-2 line-clamp-2 group-hover:text-blue-600 transition-colors">
            {event.title}
          </h3>
          <div className="space-y-1 text-sm text-slate-600">
            <div className="flex items-center gap-1">
              <MapPin className="w-4 h-4" />
              {event.city}
            </div>
            <div className="flex items-center gap-1">
              <Calendar className="w-4 h-4" />
              {date}
            </div>
            {event.lowestPrice && (
              <div className="font-semibold text-green-600">
                Rp {event.lowestPrice.toLocaleString('id-ID')}
              </div>
            )}
          </div>
        </div>
      </div>
    </Link>
  );
}

export default function LandingPage() {
  const [featuredEvents, setFeaturedEvents] = useState<Event[]>([]);
  const [events, setEvents] = useState<Event[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [city, setCity] = useState('');
  const [hasMore, setHasMore] = useState(true);
  const [offset, setOffset] = useState(0);

  const fetchFeatured = async () => {
    try {
      const res = await api.get('/api/events?status=PUBLISHED&limit=5');
      setFeaturedEvents(res.data.data || []);
    } catch (err) {
      console.error('Failed to fetch featured events', err);
    }
  };

  const fetchEvents = async (reset = false) => {
    try {
      if (reset) {
        setLoading(true);
        setOffset(0);
      } else {
        setLoadingMore(true);
      }

      const params = new URLSearchParams({
        limit: '12',
        status: 'PUBLISHED',
        offset: reset ? '0' : offset.toString(),
      });

      if (city) params.append('city', city);

      const res = await api.get(`/api/events?${params}`);
      const newEvents = res.data.data || [];

      if (reset) {
        setEvents(newEvents);
      } else {
        setEvents(prev => [...prev, ...newEvents]);
      }

      setOffset(prev => prev + newEvents.length);
      setHasMore(newEvents.length === 12);
    } catch (err) {
      console.error('Failed to fetch events', err);
    } finally {
      setLoading(false);
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    fetchFeatured();
    fetchEvents(true);
  }, []);

  useEffect(() => {
    if (city) {
      fetchEvents(true);
    }
  }, [city]);

  const scrollToEvents = () => {
    document.getElementById('events-section')?.scrollIntoView({ behavior: 'smooth' });
  };

  return (
    <div className="min-h-screen bg-slate-50">
      <PublicNavbar />

      {/* Hero Section */}
      <section className="bg-gradient-to-br from-blue-600 via-purple-600 to-indigo-700 text-white py-20 px-4">
        <div className="max-w-4xl mx-auto text-center">
          <h1 className="text-4xl md:text-6xl font-bold mb-6">
            Cari Event Seru Hari Ini
          </h1>
          <p className="text-xl md:text-2xl mb-8 opacity-90">
            Konser, festival, workshop — semua ada di sini
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center mb-8">
            <div className="relative flex-1 max-w-md">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 text-slate-400 w-5 h-5" />
              <Input
                placeholder="Cari event atau kota..."
                className="pl-10 bg-white/10 border-white/20 text-white placeholder:text-white/70 focus:bg-white/20"
                value={city}
                onChange={e => setCity(e.target.value)}
              />
            </div>
            <Button onClick={scrollToEvents} className="bg-white text-blue-600 hover:bg-slate-100 px-8 py-3 font-semibold">
              Lihat Event
            </Button>
          </div>
        </div>
      </section>

      {/* Featured Events */}
      <section className="py-16 px-4">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center gap-3 mb-8">
            <Star className="w-6 h-6 text-yellow-500" />
            <h2 className="text-2xl font-bold text-slate-900">Event Unggulan</h2>
          </div>
          {featuredEvents.length > 0 ? (
            <div className="flex gap-6 overflow-x-auto pb-4">
              {featuredEvents.map(event => (
                <div key={event.slug} className="flex-shrink-0 w-80">
                  <EventCard event={event} />
                </div>
              ))}
            </div>
          ) : (
            <div className="flex gap-6 overflow-x-auto pb-4">
              {[...Array(5)].map((_, i) => (
                <div key={i} className="flex-shrink-0 w-80">
                  <SkeletonCard />
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Event List */}
      <section id="events-section" className="py-16 px-4 bg-white">
        <div className="max-w-7xl mx-auto">
          <div className="flex flex-col md:flex-row md:items-center justify-between mb-8 gap-4">
            <h2 className="text-2xl font-bold text-slate-900">Semua Event</h2>

            {/* Filters */}
            <div className="flex gap-4">
              <select
                value={city}
                onChange={e => setCity(e.target.value)}
                className="px-4 py-2 border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                <option value="">Semua Kota</option>
                <option value="Jakarta">Jakarta</option>
                <option value="Bandung">Bandung</option>
                <option value="Surabaya">Surabaya</option>
                <option value="Yogyakarta">Yogyakarta</option>
                <option value="Medan">Medan</option>
              </select>
            </div>
          </div>

          {loading ? (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
              {[...Array(8)].map((_, i) => (
                <SkeletonCard key={i} />
              ))}
            </div>
          ) : events.length > 0 ? (
            <>
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                {events.map(event => (
                  <EventCard key={event.slug} event={event} />
                ))}
              </div>

              {hasMore && (
                <div className="text-center mt-8">
                  <Button
                    onClick={() => fetchEvents()}
                    disabled={loadingMore}
                    className="bg-slate-100 text-slate-700 hover:bg-slate-200"
                  >
                    {loadingMore ? 'Memuat...' : 'Muat Lebih Banyak'}
                  </Button>
                </div>
              )}
            </>
          ) : (
            <div className="text-center py-16">
              <div className="p-8 bg-slate-50 rounded-lg max-w-md mx-auto">
                <Calendar className="w-12 h-12 text-slate-400 mx-auto mb-4" />
                <h3 className="text-lg font-semibold text-slate-900 mb-2">Tidak ada event ditemukan</h3>
                <p className="text-slate-600 mb-4">Silakan coba kota lain</p>
                <Button onClick={() => { setCity(''); }} variant="outline">
                  Reset Filter
                </Button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* CTA Banner */}
      <section className="py-16 px-4 bg-gradient-to-r from-purple-600 to-indigo-600 text-white">
        <div className="max-w-4xl mx-auto text-center">
          <h2 className="text-3xl font-bold mb-4">Punya Event Sendiri?</h2>
          <p className="text-xl mb-8 opacity-90">Jadilah Event Organizer dan mulai jual tiket event Anda</p>
          <Link href="/register">
            <Button className="bg-white text-purple-600 hover:bg-slate-100 px-8 py-3 font-semibold text-lg">
              Jadi Event Organizer
            </Button>
          </Link>
        </div>
      </section>

      {/* Footer */}
      <Footer />
    </div>
  );
}
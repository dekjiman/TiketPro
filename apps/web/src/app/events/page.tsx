'use client';

import { useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { EventList, EventListError } from '@/components/events';
import { useEventList } from '@/hooks/useEvent';
import Footer from '@/components/Footer';
import { PublicNavbar } from '@/components/PublicNavbar';

export default function EventsPage() {
  const searchParams = useSearchParams();
  const [search, setSearch] = useState(searchParams.get('search') || '');
  const [page, setPage] = useState(Number(searchParams.get('page')) || 1);

  const { data, isLoading, error, refetch } = useEventList({
    status: 'PUBLISHED',
    search: search || undefined,
    page,
    limit: 12,
  });

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-900">
      <PublicNavbar />

      <div className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-white" style={{ fontFamily: 'Manrope' }}>
              Events
            </h1>
            <p className="text-sm text-slate-500 mt-1">
              {data?.meta?.total ?? 0} events found
            </p>
          </div>
        </div>

        <div className="bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-4 mb-6">
          <div className="flex flex-col lg:flex-row gap-4">
            <div className="flex-1">
              <input
                type="search"
                placeholder="Search events..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="w-full px-4 py-2.5 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-white placeholder:text-slate-400 focus:ring-2 focus:ring-emerald-500 focus:border-emerald-500"
              />
            </div>
          </div>
        </div>

        {error ? (
          <EventListError message={error} onRetry={refetch} />
        ) : (
          <EventList
            events={data?.data ?? []}
            loading={isLoading}
            emptyText="No events match your search"
          />
        )}

        {data && data.meta.totalPages > 1 && (
          <div className="flex justify-center gap-2 mt-8">
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Previous
            </button>
            <span className="px-4 py-2 text-slate-600 dark:text-slate-400">
              Page {page} of {data.meta.totalPages}
            </span>
            <button
              onClick={() => setPage((p) => Math.min(data.meta.totalPages, p + 1))}
              disabled={page >= data.meta.totalPages}
              className="px-4 py-2 border border-slate-300 dark:border-slate-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed hover:bg-slate-100 dark:hover:bg-slate-700"
            >
              Next
            </button>
          </div>
        )}
      </div>

      {/* Footer */}
      <Footer />
    </div>
  );
}

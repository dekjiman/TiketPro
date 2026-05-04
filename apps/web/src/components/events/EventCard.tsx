'use client';

import Image from 'next/image';
import Link from 'next/link';
import type { Event } from '@/types/event';

interface EventCardProps {
  event: Event;
}

const statusColors = {
  DRAFT: 'bg-gray-100 text-gray-600 dark:bg-slate-800 dark:text-slate-300',
  REVIEW: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
  PUBLISHED: 'bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300',
  CANCELLED: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-300',
  COMPLETED: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300',
  ARCHIVED: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
};

const statusLabels = {
  DRAFT: 'Draft',
  REVIEW: 'Review',
  PUBLISHED: 'Published',
  CANCELLED: 'Cancelled',
  COMPLETED: 'Completed',
  ARCHIVED: 'Archived',
};

export function EventCard({ event }: EventCardProps) {
  const startDate = new Date(event.startDate);
  const dateStr = startDate.toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });

  return (
    <Link
      href={`/events/${event.slug || event.id}`}
      className="group block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden hover:shadow-lg transition-all"
    >
      <div className="relative aspect-[16/9] bg-slate-100 dark:bg-slate-800">
        {event.posterUrl ? (
          <Image
            src={event.posterUrl}
            alt={event.title}
            fill
            className="object-cover group-hover:scale-105 transition-transform duration-300"
            sizes="(max-width: 768px) 100vw, (max-width: 1200px) 50vw, 33vw"
          />
        ) : (
          <div className="flex items-center justify-center h-full text-slate-400">
            <svg className="w-12 h-12" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
            </svg>
          </div>
        )}
        {event.status !== 'PUBLISHED' && (
          <span className={`absolute top-3 right-3 px-2.5 py-1 text-xs font-medium rounded-full ${statusColors[event.status]}`}>
            {statusLabels[event.status]}
          </span>
        )}
      </div>
      <div className="p-4">
        <h3 className="font-semibold text-slate-900 dark:text-white truncate group-hover:text-emerald-600 transition-colors">
          {event.title}
        </h3>
        <div className="mt-2 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span>{dateStr}</span>
        </div>
        <div className="mt-1 flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
          <svg className="w-4 h-4 flex-shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
          </svg>
          <span>{event.city}</span>
        </div>
      </div>
    </Link>
  );
}

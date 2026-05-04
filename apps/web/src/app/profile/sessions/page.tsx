'use client';

import { useState, useEffect, useCallback } from 'react';
import Link from 'next/link';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { formatDate } from '@/lib/utils';

interface Session {
  id: string;
  deviceName?: string;
  deviceType?: string;
  browser?: string;
  os?: string;
  ipAddress: string;
  city?: string;
  createdAt: string;
  expiresAt: string;
}

export default function SessionsPage() {
  const toast = useToast();
  const [sessions, setSessions] = useState<Session[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [deleting, setDeleting] = useState<string | null>(null);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: Session[] }>('/api/users/me/sessions');
      const res = response.data;
      setSessions(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSessions();
  }, [loadSessions]);

  const handleLogoutSession = async (sessionId: string) => {
    if (deleting) return;
    setDeleting(sessionId);
    try {
      await api.delete(`/api/users/me/sessions/${sessionId}`);
      setSessions(sessions.filter((s) => s.id !== sessionId));
      toast.showToast('success', 'Sesi berakhir');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setDeleting(null);
    }
  };

  const handleLogoutAll = async () => {
    if (deleting || !confirm('Yakin ingin logout dari semua perangkat lain?')) return;

    setDeleting('all');
    try {
      await api.delete('/api/users/me/sessions');
      setSessions(sessions.slice(0, 1));
      toast.showToast('success', 'Semua sesi lain berakhir');
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setDeleting(null);
    }
  };

  const getDeviceIcon = (deviceType?: string) => {
    if (deviceType === 'mobile') {
      return (
        <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 18h.01M8 21h8a2 2 0 002-2V5a2 2 0 00-2-2H8a2 2 0 00-2 2v14a2 2 0 002 2z" />
        </svg>
      );
    }
    return (
      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.75 17L9 20l-1 1h8l-1-1-.75-3M3 13h18M5 17h14a2 2 0 002-2V5a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
      </svg>
    );
  };

  const getDeviceInfo = (session: Session) => {
    const parts = [];
    if (session.browser) parts.push(session.browser);
    if (session.os) parts.push(session.os);
    if (session.city) parts.push(session.city);
    return parts.join(' • ') || session.ipAddress;
  };

  if (loading) {
    return (
      <div className="max-w-2xl mx-auto py-8 space-y-4">
        <div className="animate-pulse space-y-4">
          <div className="h-8 w-32 bg-slate-200 rounded" />
          {[1, 2, 3].map((i) => (
            <div key={i} className="h-20 bg-slate-200 rounded" />
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto py-8 space-y-6">
<div className="flex items-center justify-between">
          <div>
            <Link href="/profile" className="text-sm text-slate-500 hover:text-emerald-700 dark:hover:text-emerald-400">
              ← Kembali ke Profil
            </Link>
            <h1 className="text-2xl font-bold mt-2" style={{ fontFamily: 'Manrope' }}>
              Sesi Aktif
            </h1>
          </div>
          {sessions.length > 1 && (
            <Button variant="danger" onClick={handleLogoutAll} loading={deleting === 'all'} disabled={!!deleting}>
              Logout Semua
            </Button>
          )}
        </div>

        {error && (
          <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <div className="flex items-center justify-between">
              <p className="text-red-600 dark:text-red-400 text-sm">{error}</p>
              <button onClick={loadSessions} className="text-sm text-emerald-700 dark:text-emerald-400 hover:underline ml-4">
                Retry
              </button>
            </div>
          </div>
        )}

        {loading && (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-20 bg-slate-200 rounded-lg animate-pulse" />
            ))}
          </div>
        )}

      {!loading && sessions.length === 0 ? (
        <div className="text-center py-12 text-slate-500">
          <p>Tidak ada sesi aktif</p>
        </div>
      ) : !loading && (
        <div className="space-y-3">
          {sessions.map((session, index) => (
            <div
              key={session.id}
              className="flex items-center justify-between p-4 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700"
            >
              <div className="flex items-center gap-4">
                <div className="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center text-slate-500">
                  {getDeviceIcon(session.deviceType)}
                </div>
                <div>
                  <p className="font-medium">
                    {index === 0 ? 'Perangkat Saat Ini' : session.deviceName || 'Perangkat Lain'}
                  </p>
                  <p className="text-sm text-slate-500">{getDeviceInfo(session)}</p>
                  <p className="text-xs text-slate-400">Aktif sejak {formatDate(session.createdAt)}</p>
                </div>
              </div>
              {index > 0 && (
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleLogoutSession(session.id)}
                  loading={deleting === session.id}
                  disabled={!!deleting}
                >
                  Logout
                </Button>
              )}
            </div>
          ))}
        </div>
      )}

      <p className="text-xs text-slate-500 text-center">
        Sesi akan expire otomatis. Login ulang untuk memperbarui.
      </p>
    </div>
  );
}

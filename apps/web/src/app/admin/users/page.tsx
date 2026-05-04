'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';
import { formatDate } from '@/lib/utils';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  isVerified: boolean;
  createdAt: string;
}

interface UserDetail {
  profile: User & { phone?: string; city?: string; twoFAEnabled: boolean; failedAttempts: number; lockedUntil?: string };
  sessions: { id: string; browser?: string; os?: string; ipAddress: string; city?: string; createdAt: string }[];
  activities: { id: string; event: string; ipAddress: string; createdAt: string }[];
}

export default function AdminUsersPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();
  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  
  // Role protection check
  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      toast.showToast('error', 'Access denied. Admin only.');
      const roleDashboard: Record<string, string> = {
        SUPER_ADMIN: '/admin/users',
        EO_ADMIN: '/eo',
        EO_STAFF: '/eo',
        AFFILIATE: '/affiliate',
        RESELLER: '/reseller',
        CUSTOMER: '/dashboard',
      };
      router.push(roleDashboard[user.role] || '/dashboard');
    }
  }, [user, router, toast]);

  // Loading state while checking role
  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="flex flex-col items-center gap-4">
          <div className="w-8 h-8 border-2 border-[#065F46] border-t-transparent rounded-full animate-spin" />
          <p className="text-sm text-slate-500">Checking permissions...</p>
        </div>
      </div>
    );
  }
  
  // Filters
  const [search, setSearch] = useState('');
  const [role, setRole] = useState('');
  const [status, setStatus] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  // Detail
  const [selectedUser, setSelectedUser] = useState<UserDetail | null>(null);
  const [detailLoading, setDetailLoading] = useState(false);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams();
      if (search) params.set('search', search);
      if (role) params.set('role', role);
      if (status) params.set('status', status);
      params.set('page', String(page));
      params.set('limit', '20');

      const response = await api.get<{ data: { users: User[]; totalPages: number } }>(`/api/admin/users?${params}`);
      const res = response.data?.data || response.data;
      setUsers(res?.users || []);
      setTotalPages(res?.totalPages || 1);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  }, [search, role, status, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const loadUserDetail = async (userId: string) => {
    setDetailLoading(true);
    try {
      const response = await api.get<{ data: UserDetail }>(`/api/admin/users/${userId}`);
      const data = response.data?.data || response.data;
      setSelectedUser(data);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setDetailLoading(false);
    }
  };

  const handleStatusChange = async (userId: string, newStatus: string) => {
    if (saving) return;
    setSaving(true);
    try {
      await api.patch(`/api/admin/users/${userId}/status`, { status: newStatus });
      setSelectedUser(null);
      loadUsers();
      toast.showToast('success', `User status changed to ${newStatus}`);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'ACTIVE': return 'bg-emerald-100 text-emerald-700';
      case 'SUSPENDED': return 'bg-yellow-100 text-yellow-700';
      case 'BANNED': return 'bg-red-100 text-red-700';
      case 'PENDING_APPROVAL': return 'bg-blue-100 text-blue-700';
      default: return 'bg-slate-100 text-slate-700';
    }
  };

  return (
    <div className="max-w-7xl mx-auto py-8">
      <h1 className="text-2xl font-bold mb-6">Kelola Users</h1>

      {/* Quick Filters */}
      <div className="flex gap-2 mb-4">
        <Button
          size="sm"
          variant={status === 'PENDING_APPROVAL' ? 'primary' : 'ghost'}
          onClick={() => { setStatus('PENDING_APPROVAL'); setRole('EO_ADMIN'); setPage(1); }}
        >
          Pending EO Admin
        </Button>
        <Button
          size="sm"
          variant={status === '' ? 'primary' : 'ghost'}
          onClick={() => { setStatus(''); setRole(''); setPage(1); }}
        >
          Semua
        </Button>
      </div>

      {error && (
        <div className="mb-4 p-3 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      {/* Filters */}
      <div className="flex flex-wrap gap-4 mb-6">
        <Input
          placeholder="Search name or email..."
          value={search}
          onChange={(e) => { setSearch(e.target.value); setPage(1); }}
          className="w-64"
        />
        <select
          value={role}
          onChange={(e) => { setRole(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Roles</option>
          <option value="SUPER_ADMIN">Super Admin</option>
          <option value="EO_ADMIN">EO Admin</option>
          <option value="EO_STAFF">EO Staff</option>
          <option value="AFFILIATE">Affiliate</option>
          <option value="RESELLER">Reseller</option>
          <option value="CUSTOMER">Customer</option>
        </select>
        <select
          value={status}
          onChange={(e) => { setStatus(e.target.value); setPage(1); }}
          className="px-4 py-2 border border-slate-300 rounded-lg bg-white"
        >
          <option value="">All Status</option>
          <option value="ACTIVE">Active</option>
          <option value="PENDING_APPROVAL">Pending</option>
          <option value="SUSPENDED">Suspended</option>
          <option value="BANNED">Banned</option>
        </select>
      </div>

      {/* Table */}
      <div className="bg-white rounded-lg border overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-slate-500">Loading...</div>
        ) : (
        <table className="w-full">
          <thead className="bg-slate-50 border-b">
            <tr>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">User</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Role</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Status</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Verified</th>
              <th className="px-4 py-3 text-left text-sm font-medium text-slate-600">Created</th>
            </tr>
          </thead>
<tbody className="divide-y">
            {loading ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">Loading...</td></tr>
            ) : users.length === 0 ? (
              <tr><td colSpan={5} className="px-4 py-8 text-center text-slate-500">No users found</td></tr>
            ) : (
              users.map((user) => (
                <tr 
                  key={user.id} 
                  onClick={() => loadUserDetail(user.id)}
                  className="hover:bg-slate-50 cursor-pointer"
                >
                  <td className="px-4 py-3">
                    <div className="font-medium">{user.name}</div>
                    <div className="text-sm text-slate-500">{user.email}</div>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.role === 'SUPER_ADMIN' ? 'bg-purple-100 text-purple-700' :
                      user.role === 'EO_ADMIN' ? 'bg-blue-100 text-blue-700' :
                      user.role === 'EO_STAFF' ? 'bg-cyan-100 text-cyan-700' :
                      user.role === 'AFFILIATE' ? 'bg-green-100 text-green-700' :
                      user.role === 'RESELLER' ? 'bg-orange-100 text-orange-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                      user.status === 'ACTIVE' ? 'bg-green-100 text-green-700' :
                      user.status === 'INACTIVE' ? 'bg-gray-100 text-gray-700' :
                      user.status === 'PENDING_APPROVAL' ? 'bg-yellow-100 text-yellow-700' :
                      user.status === 'SUSPENDED' ? 'bg-orange-100 text-orange-700' :
                      user.status === 'BANNED' ? 'bg-red-100 text-red-700' :
                      'bg-gray-100 text-gray-700'
                    }`}>
                      {user.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {user.isVerified ? (
                      <span className="text-green-600">Yes</span>
                    ) : (
                      <span className="text-slate-400">-</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-sm text-slate-500">{formatDate(user.createdAt)}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
        )}
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex justify-center gap-2 mt-4">
          <Button
            variant="ghost"
            size="sm"
            disabled={page === 1}
            onClick={() => setPage(page - 1)}
          >
            Prev
          </Button>
          <span className="px-4 py-2 text-sm">{page} / {totalPages}</span>
          <Button
            variant="ghost"
            size="sm"
            disabled={page === totalPages}
            onClick={() => setPage(page + 1)}
          >
            Next
          </Button>
        </div>
      )}

      {/* Detail Panel */}
      {selectedUser && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center p-4 z-50" onClick={() => setSelectedUser(null)}>
          <div className="bg-white rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b flex justify-between items-center">
              <h2 className="text-lg font-bold">User Detail</h2>
              <button onClick={() => setSelectedUser(null)} className="text-slate-400 hover:text-slate-600">✕</button>
            </div>
            
            {detailLoading ? (
              <div className="p-6 text-center">Loading...</div>
            ) : (
              <div className="p-6 space-y-6">
                {/* Info */}
                <section>
                  <h3 className="font-semibold mb-3">Informasi</h3>
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div><span className="text-slate-500">Name:</span> {selectedUser.profile.name}</div>
                    <div><span className="text-slate-500">Email:</span> {selectedUser.profile.email}</div>
                    <div><span className="text-slate-500">Phone:</span> {selectedUser.profile.phone || '-'}</div>
                    <div><span className="text-slate-500">City:</span> {selectedUser.profile.city || '-'}</div>
                    <div><span className="text-slate-500">Role:</span> {selectedUser.profile.role}</div>
                    <div><span className="text-slate-500">Status:</span> 
                      <span className={`ml-2 px-2 py-0.5 text-xs rounded-full ${getStatusColor(selectedUser.profile.status)}`}>
                        {selectedUser.profile.status}
                      </span>
                    </div>
                    <div><span className="text-slate-500">Verified:</span> {selectedUser.profile.isVerified ? 'Yes' : 'No'}</div>
                    <div><span className="text-slate-500">2FA:</span> {selectedUser.profile.twoFAEnabled ? 'Enabled' : 'Disabled'}</div>
                    <div><span className="text-slate-500">Failed Attempts:</span> {selectedUser.profile.failedAttempts}</div>
                    <div><span className="text-slate-500">Created:</span> {formatDate(selectedUser.profile.createdAt)}</div>
                  </div>
                </section>

                {/* Sessions */}
                <section>
                  <h3 className="font-semibold mb-3">Sessions ({selectedUser.sessions.length})</h3>
                  <div className="space-y-2">
                    {selectedUser.sessions.map((s) => (
                      <div key={s.id} className="text-sm p-2 bg-slate-50 rounded">
                        {s.browser} {s.os} • {s.ipAddress} • {formatDate(s.createdAt)}
                      </div>
                    ))}
                    {selectedUser.sessions.length === 0 && <p className="text-sm text-slate-500">No active sessions</p>}
                  </div>
                </section>

                {/* Activity */}
                <section>
                  <h3 className="font-semibold mb-3">Recent Activity</h3>
                  <div className="space-y-2">
                    {selectedUser.activities.map((a) => (
                      <div key={a.id} className="text-sm p-2 bg-slate-50 rounded flex justify-between">
                        <span>{a.event}</span>
                        <span className="text-slate-500">{formatDate(a.createdAt)}</span>
                      </div>
                    ))}
                    {selectedUser.activities.length === 0 && <p className="text-sm text-slate-500">No activity</p>}
                  </div>
                </section>

                {/* Actions */}
                <section className="flex gap-2 pt-4 border-t">
                  {selectedUser.profile.status === 'PENDING_APPROVAL' && (
                    <Button size="sm" onClick={() => handleStatusChange(selectedUser.profile.id, 'ACTIVE')}>
                      Approve
                    </Button>
                  )}
                  {selectedUser.profile.status === 'ACTIVE' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedUser.profile.id, 'SUSPENDED')}>
                      Suspend
                    </Button>
                  )}
                  {selectedUser.profile.status === 'SUSPENDED' && (
                    <Button variant="outline" size="sm" onClick={() => handleStatusChange(selectedUser.profile.id, 'ACTIVE')}>
                      Activate
                    </Button>
                  )}
                  {selectedUser.profile.status !== 'BANNED' && (
                    <Button variant="danger" size="sm" onClick={() => handleStatusChange(selectedUser.profile.id, 'BANNED')}>
                      Ban
                    </Button>
                  )}
                </section>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
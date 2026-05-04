'use client';

import { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { api, getApiError } from '@/lib/api';
import { Button, useToast } from '@/components/ui';
import { useAuthStore } from '@/store/authStore';

interface Setting {
  id: string;
  key: string;
  value: string;
  category: string;
}

interface SettingGroup {
  name: string;
  fields: {
    key: string;
    label: string;
    type: 'text' | 'textarea' | 'boolean' | 'number';
    description?: string;
}[];
}

const SETTING_GROUPS: SettingGroup[] = [
  {
    name: 'General',
    fields: [
      { key: 'site_name', label: 'Site Name', type: 'text', description: 'Nama aplikasi' },
      { key: 'site_tagline', label: 'Tagline', type: 'text', description: 'Tagline aplikasi' },
      { key: 'contact_email', label: 'Contact Email', type: 'text', description: 'Email kontak' },
      { key: 'contact_phone', label: 'Contact Phone', type: 'text', description: 'Nomor telepon' },
    ],
  },
  {
    name: 'Maintenance',
    fields: [
      { key: 'maintenance_mode', label: 'Maintenance Mode', type: 'boolean', description: 'Aktifkan mode maintenance' },
      { key: 'maintenance_message', label: 'Maintenance Message', type: 'textarea', description: 'Pesan saat maintenance' },
    ],
  },
  {
    name: 'Security',
    fields: [
      { key: 'require_2fa', label: 'Require 2FA', type: 'boolean', description: 'Wajibkan 2FA untuk semua user' },
      { key: 'password_min_length', label: 'Password Min Length', type: 'number', description: 'Minimal panjang password' },
      { key: 'session_timeout', label: 'Session Timeout (minutes)', type: 'number', description: 'Timeout sesi dalam menit' },
    ],
  },
  {
    name: 'Email',
    fields: [
      { key: 'smtp_host', label: 'SMTP Host', type: 'text', description: 'Host SMTP' },
      { key: 'smtp_port', label: 'SMTP Port', type: 'number', description: 'Port SMTP' },
      { key: 'smtp_user', label: 'SMTP User', type: 'text', description: 'Username SMTP' },
      { key: 'smtp_from', label: 'Sender Email', type: 'text', description: 'Email pengirim' },
    ],
  },
  {
    name: 'Payment',
    fields: [
      { key: 'payment_enabled', label: 'Payment Enabled', type: 'boolean', description: 'Aktifkan pembayaran' },
      { key: 'payment_min_amount', label: 'Min Amount', type: 'number', description: 'Minimal nominal pembayaran' },
      { key: 'payment_max_amount', label: 'Max Amount', type: 'number', description: 'Maksimal nominal pembayaran' },
    ],
  },
];

export default function SettingsPage() {
  const router = useRouter();
  const { user } = useAuthStore();
  const toast = useToast();

  const [settings, setSettings] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const [error, setError] = useState('');
  const [activeTab, setActiveTab] = useState('general');

  const loadSettings = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const response = await api.get<{ data: Setting[] }>('/api/admin/settings');
      const data = response.data?.data || [];
      const settingsMap: Record<string, string> = {};
      data.forEach((s: Setting) => {
        settingsMap[s.key] = s.value;
      });
      setSettings(settingsMap);
    } catch (err) {
      setError(getApiError(err).error);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (user && user.role !== 'SUPER_ADMIN') {
      toast.showToast('error', 'Access denied');
      router.push('/admin');
    }
  }, [user, router, toast]);

  useEffect(() => {
    if (user?.role === 'SUPER_ADMIN') {
      loadSettings();
    }
  }, [user, loadSettings]);

  const handleSave = async () => {
    if (saving) return;
    setSaving(true);
    setError('');

    try {
      const settingsArray = Object.entries(settings).map(([key, value]) => ({ key, value }));
      await api.put('/api/admin/settings', { settings: settingsArray });
      toast.showToast('success', 'Settings saved');
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSaving(false);
    }
  };

  const handleChange = (key: string, value: string) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  const handleLogoUpload = async (file: File) => {
    if (!file || uploadingLogo) return;
    setUploadingLogo(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await api.post<{ url: string }>('/api/admin/settings/upload/logo', formData);
      const logoUrl = res.data?.url || '';
      if (logoUrl) {
        handleChange('site_logo', logoUrl);
        toast.showToast('success', 'Logo berhasil diupload');
      }
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setUploadingLogo(false);
    }
  };

  if (!user || user.role !== 'SUPER_ADMIN') {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }

  const tabs = SETTING_GROUPS.map((g) => g.name);
  const activeGroup = SETTING_GROUPS.find((g) => g.name === activeTab) || SETTING_GROUPS[0];

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold" style={{ fontFamily: 'Manrope' }}>
          Settings
        </h1>
        <Button onClick={handleSave} loading={saving}>
          Save Changes
        </Button>
      </div>

      {error && (
        <div className="p-4 bg-red-50 border border-red-200 rounded-lg text-red-600 text-sm">
          {error}
        </div>
      )}

      <div className="flex gap-6">
        <div className="w-48 flex-shrink-0">
          <nav className="space-y-1">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => setActiveTab(tab)}
                className={`w-full text-left px-4 py-2 rounded-lg text-sm transition-colors ${
                  activeTab === tab
                    ? 'bg-emerald-700 dark:bg-emerald-600 text-white'
                    : 'hover:bg-slate-100 dark:hover:bg-slate-800'
                }`}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex-1 bg-white dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 p-6">
          {loading ? (
            <div className="flex justify-center py-8">
              <div className="w-8 h-8 border-2 border-emerald-700 dark:border-emerald-400 border-t-transparent rounded-full animate-spin" />
            </div>
          ) : (
            <div className="space-y-6">
              <h2 className="text-lg font-semibold">{activeGroup.name}</h2>
              {activeGroup.name === 'General' && (
                <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4">
                  <p className="text-sm font-medium mb-2">Site Logo</p>
                  <p className="text-xs text-slate-500 mb-3">Upload logo aplikasi (PNG, JPG, WEBP, SVG)</p>
                  {settings.site_logo ? (
                    <div className="mb-3">
                      <img
                        src={settings.site_logo}
                        alt="Site logo"
                        className="h-16 w-auto rounded border border-slate-200 bg-white p-2"
                      />
                    </div>
                  ) : null}
                  <div className="flex items-center gap-3">
                    <label className="inline-flex items-center">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp,image/svg+xml"
                        className="hidden"
                        onChange={(e) => {
                          const file = e.target.files?.[0];
                          if (file) {
                            void handleLogoUpload(file);
                          }
                        }}
                      />
                      <span className="inline-flex items-center rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium hover:bg-slate-50 dark:border-slate-600 dark:hover:bg-slate-700">
                        {uploadingLogo ? 'Uploading...' : 'Pilih File Logo'}
                      </span>
                    </label>
                  </div>
                </div>
              )}
              <div className="space-y-4">
                {activeGroup.fields.map((field) => (
                  <div key={field.key}>
                    {field.type === 'boolean' ? (
                      <label className="flex items-center gap-3 cursor-pointer">
                        <input
                          type="checkbox"
                          checked={settings[field.key] === 'true'}
                          onChange={(e) => handleChange(field.key, e.target.checked ? 'true' : 'false')}
                          className="w-5 h-5 rounded border-slate-300 text-emerald-700 dark:text-emerald-400 focus:ring-emerald-600"
                        />
                        <div>
                          <p className="font-medium">{field.label}</p>
                          {field.description && (
                            <p className="text-sm text-slate-500">{field.description}</p>
                          )}
                        </div>
                      </label>
                    ) : field.type === 'textarea' ? (
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{field.label}</label>
                        {field.description && (
                          <p className="text-sm text-slate-500 mb-1.5">{field.description}</p>
                        )}
                        <textarea
                          value={settings[field.key] || ''}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          rows={4}
                          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 outline-none transition resize-none"
                        />
                      </div>
                    ) : (
                      <div>
                        <label className="block text-sm font-medium mb-1.5">{field.label}</label>
                        {field.description && (
                          <p className="text-sm text-slate-500 mb-1.5">{field.description}</p>
                        )}
                        <input
                          type={field.type === 'number' ? 'number' : 'text'}
                          value={settings[field.key] || ''}
                          onChange={(e) => handleChange(field.key, e.target.value)}
                          className="w-full px-4 py-3 border border-slate-300 dark:border-slate-600 rounded-lg bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 focus:ring-2 focus:ring-emerald-500/40 focus:border-emerald-600 outline-none transition"
                        />
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

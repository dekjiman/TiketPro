'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getApiError } from '@/lib/api';
import { Button, Input, useToast } from '@/components/ui';
import {
  ArrowDownToLine,
  Copy,
  FileUp,
  Mail,
  MessageSquare,
  Plus,
  QrCode,
  RefreshCcw,
  Ticket,
  Users,
  X,
} from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  quota: number;
  sold: number;
  isInternal?: boolean;
  colorHex?: string | null;
  price?: number;
}

interface EventFull {
  id: string;
  title: string;
  slug: string;
  eoId: string;
  categories?: TicketCategory[];
}

interface EoProfile {
  id: string;
}

interface InternalTicket {
  id: string;
  ticketCode: string;
  holderName: string;
  holderEmail?: string | null;
  holderPhone?: string | null;
  category: {
    id: string;
    name: string;
    colorHex?: string | null;
  };
  status: string;
  source: string;
  qrEncrypted?: string | null;
  qrImageUrl?: string | null;
  pdfUrl?: string | null;
  generatedAt?: string | null;
  createdAt?: string;
}

interface AttendeeRow {
  id: string;
  name: string;
  email: string;
  phone: string;
}

interface InternalTicketGeneratorProps {
  eventId: string;
  canGenerate: boolean;
}

function cleanText(value: string) {
  return value.trim();
}

function createAttendeeRow(partial?: Partial<AttendeeRow>): AttendeeRow {
  return {
    id: crypto.randomUUID(),
    name: partial?.name || '',
    email: partial?.email || '',
    phone: partial?.phone || '',
  };
}

function csvEscape(value: string) {
  const needsQuotes = /[",\n]/.test(value);
  const safe = value.replaceAll('"', '""');
  return needsQuotes ? `"${safe}"` : safe;
}

function splitCsvLine(line: string) {
  const cells: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i += 1) {
    const char = line[i];
    const nextChar = line[i + 1];

    if (char === '"') {
      if (inQuotes && nextChar === '"') {
        current += '"';
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }

    if (!inQuotes && (char === ',' || char === ';' || char === '\t')) {
      cells.push(current.trim());
      current = '';
      continue;
    }

    current += char;
  }

  cells.push(current.trim());
  return cells.map(cell => cell.replace(/^"|"$/g, '').trim());
}

function withCacheBuster(url: string, version?: string | number | null) {
  if (!url) {
    return '';
  }

  if (!version) {
    return url;
  }

  const separator = url.includes('?') ? '&' : '?';
  return `${url}${separator}v=${encodeURIComponent(String(version))}`;
}

function normalizePublicUrl(url: string) {
  if (!url) {
    return '';
  }

  const publicIndex = url.indexOf('/public/');
  if (publicIndex >= 0) {
    return url.slice(publicIndex);
  }

  return url;
}

export function InternalTicketGenerator({ eventId, canGenerate }: InternalTicketGeneratorProps) {
  const toast = useToast();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [event, setEvent] = useState<EventFull | null>(null);
  const [eoProfileId, setEoProfileId] = useState<string | null>(null);
  const [permissionLoaded, setPermissionLoaded] = useState(false);
  const [tickets, setTickets] = useState<InternalTicket[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sendingTicketId, setSendingTicketId] = useState<string | null>(null);
  const [error, setError] = useState('');
  const [successMessage, setSuccessMessage] = useState('');
  const [selectedCategoryId, setSelectedCategoryId] = useState('');
  const [quantity, setQuantity] = useState(1);
  const [attendees, setAttendees] = useState<AttendeeRow[]>([]);

  const internalCategories = useMemo(
    () => (event?.categories || []).filter(category => category.isInternal),
    [event]
  );
  const isOwner = Boolean(canGenerate && permissionLoaded && event?.eoId && eoProfileId && event.eoId === eoProfileId);
  const selectedCategory = internalCategories.find(category => category.id === selectedCategoryId);
  const remainingQuota = selectedCategory ? Math.max(0, (selectedCategory.quota || 0) - (selectedCategory.sold || 0)) : 0;

  const loadData = async () => {
    if (!canGenerate || !eventId) {
      return;
    }

    setLoading(true);
    setError('');

    try {
      const [eventRes, profileRes] = await Promise.all([
        api.get(`/api/events/${eventId}/full`),
        api.get('/api/eo/profile'),
      ]);

      const eventData = eventRes.data?.data || eventRes.data;
      setEvent(eventData as EventFull);

      const eoProfile = profileRes.data?.data || profileRes.data;
      setEoProfileId((eoProfile as EoProfile | null)?.id || null);
      setPermissionLoaded(true);

      const firstInternalCategory = (eventData?.categories || []).find((category: TicketCategory) => category.isInternal);
      if (firstInternalCategory) {
        setSelectedCategoryId(prev => prev || firstInternalCategory.id);
      }

      if (!eventData?.eoId || !eoProfile || (eoProfile as EoProfile).id !== eventData.eoId) {
        setTickets([]);
        setError('Event ini bukan milik EO Admin yang sedang login');
        return;
      }

      const ticketsRes = await api.get(`/api/eo/events/${eventId}/tickets/internal?limit=100`);
      setTickets((ticketsRes.data?.tickets || []) as InternalTicket[]);
    } catch (err) {
      const message = getApiError(err).error;
      setError(message);
      setEoProfileId(null);
      setPermissionLoaded(true);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!canGenerate) {
      return;
    }

    void loadData();
    setAttendees([]);
    setQuantity(1);
    setSuccessMessage('');
  }, [canGenerate, eventId]);

  useEffect(() => {
    if (attendees.length > 0) {
      setQuantity(attendees.length);
    }
  }, [attendees.length]);

  const refreshTickets = async () => {
    if (!isOwner) {
      return;
    }

    try {
      const ticketsRes = await api.get(`/api/eo/events/${eventId}/tickets/internal?limit=100`);
      setTickets((ticketsRes.data?.tickets || []) as InternalTicket[]);
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    }
  };

  const parseCsv = (content: string) => {
    const rows = content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(Boolean);

    if (rows.length === 0) {
      return [];
    }

    const normalized = rows[0].toLowerCase();
    const hasHeader = normalized.includes('name') || normalized.includes('email') || normalized.includes('phone');
    const startIndex = hasHeader ? 1 : 0;

    return rows.slice(startIndex).map(line => {
      const [name = '', email = '', phone = ''] = splitCsvLine(line);
      return createAttendeeRow({ name, email, phone });
    });
  };

  const handleCsvUpload = async (file: File) => {
    const text = await file.text();
    const parsed = parseCsv(text);
    if (parsed.length === 0) {
      toast.showToast('error', 'CSV kosong atau tidak valid');
      return;
    }

    setAttendees(parsed);
    setQuantity(parsed.length);
    toast.showToast('success', `CSV berhasil dibaca: ${parsed.length} attendee`);
  };

  const downloadCsvTemplate = () => {
    const header = ['name', 'email', 'phone'];
    const exampleRows = [
      ['Budi Santoso', 'budi@example.com', '081234567890'],
      ['Siti Aisyah', 'siti@example.com', ''],
    ];

    const csv = [header, ...exampleRows]
      .map(row => row.map(cell => csvEscape(String(cell || ''))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `internal-ticket-template-${event?.slug || eventId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const addRow = () => {
    setAttendees(prev => [...prev, createAttendeeRow()]);
    setQuantity(prev => prev + 1);
  };

  const removeRow = (index: number) => {
    setAttendees(prev => prev.filter((_, currentIndex) => currentIndex !== index));
  };

  const updateRow = (index: number, field: keyof AttendeeRow, value: string) => {
    setAttendees(prev => prev.map((row, currentIndex) => (
      currentIndex === index ? { ...row, [field]: value } : row
    )));
  };

  const exportCsv = () => {
    if (tickets.length === 0) {
      toast.showToast('error', 'Belum ada tiket untuk diekspor');
      return;
    }

    const header = ['Ticket Code', 'Name', 'Category', 'Status', 'Source', 'Email', 'Phone', 'PDF URL', 'QR URL'];
    const rows = tickets.map(ticket => [
      ticket.ticketCode,
      ticket.holderName,
      ticket.category?.name || '',
      ticket.status,
      ticket.source,
      ticket.holderEmail || '',
      ticket.holderPhone || '',
      normalizePublicUrl(ticket.pdfUrl || ''),
      ticket.qrImageUrl || '',
    ]);

    const csv = [header, ...rows]
      .map(row => row.map(cell => csvEscape(String(cell || ''))).join(','))
      .join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = `internal-tickets-${event?.slug || eventId}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const bulkDownloadPdf = () => {
    const pdfs = tickets
      .map(ticket => normalizePublicUrl(ticket.pdfUrl || ''))
      .filter(Boolean) as string[];

    if (pdfs.length === 0) {
      toast.showToast('error', 'Belum ada PDF untuk diunduh');
      return;
    }

    pdfs.forEach((pdfUrl, index) => {
      window.setTimeout(() => {
        const anchor = document.createElement('a');
        anchor.href = pdfUrl;
        anchor.target = '_blank';
        anchor.rel = 'noreferrer';
        anchor.click();
      }, index * 250);
    });
  };

  const handleGenerate = async () => {
    if (!isOwner) {
      toast.showToast('error', 'Panel ini hanya untuk EO Admin event ini');
      return;
    }

    if (!selectedCategoryId) {
      toast.showToast('error', 'Pilih kategori internal terlebih dahulu');
      return;
    }
    if (!selectedCategory || remainingQuota <= 0) {
      toast.showToast('error', 'Kuota kategori internal sudah habis');
      return;
    }

    const hasManualRows = attendees.length > 0;
    const cleanRows = attendees
      .map(row => ({
        name: cleanText(row.name),
        email: cleanText(row.email),
        phone: cleanText(row.phone),
      }))
      .filter(row => row.name.length > 0 || row.email.length > 0 || row.phone.length > 0);

    if (hasManualRows && cleanRows.length === 0) {
      toast.showToast('error', 'Isi minimal satu attendee atau hapus baris manual');
      return;
    }

    if (hasManualRows && cleanRows.some(row => row.email || row.phone)) {
      const missingName = cleanRows.some(row => !row.name);
      if (missingName) {
        toast.showToast('error', 'Setiap attendee manual wajib memiliki nama');
        return;
      }
    }

    const payload = hasManualRows
      ? {
          categoryId: selectedCategoryId,
          quantity: cleanRows.length,
          attendees: cleanRows.map(row => ({
            name: row.name,
            email: row.email || undefined,
            phone: row.phone || undefined,
          })),
        }
      : {
          categoryId: selectedCategoryId,
          quantity,
        };
    if ((payload.quantity || 0) > remainingQuota) {
      toast.showToast('error', `Melebihi sisa kuota. Sisa kuota saat ini: ${remainingQuota}`);
      return;
    }

    setSaving(true);
    setError('');
    setSuccessMessage('');

    try {
      const res = await api.post(`/api/eo/events/${eventId}/tickets/generate`, payload);
      const generated = (res.data?.tickets || []) as InternalTicket[];
      const generatedCategory = internalCategories.find(category => category.id === selectedCategoryId);
      setSuccessMessage(`Berhasil generate ${generated.length} tiket internal`);
      toast.showToast('success', `Berhasil generate ${generated.length} tiket internal`);
      setTickets(prev => [
        ...generated.map(ticket => ({
          ...ticket,
          category: {
            id: generatedCategory?.id || selectedCategoryId,
            name: generatedCategory?.name || 'Internal',
            colorHex: generatedCategory?.colorHex || null,
          },
        })),
        ...prev,
      ]);
      setAttendees([]);
      setQuantity(1);
      setSelectedCategoryId(prev => prev || selectedCategoryId);
    } catch (err) {
      const message = getApiError(err).error;
      setError(message);
      toast.showToast('error', message);
    } finally {
      setSaving(false);
    }
  };

  const sendTicket = async (ticketId: string, channel: 'email' | 'whatsapp') => {
    if (!isOwner) {
      toast.showToast('error', 'Aksi ini hanya untuk EO Admin event ini');
      return;
    }

    const target = tickets.find(ticket => ticket.id === ticketId);
    if (channel === 'email' && !target?.holderEmail) {
      toast.showToast('error', 'Tiket ini tidak memiliki email penerima');
      return;
    }
    if (channel === 'whatsapp' && !target?.holderPhone) {
      toast.showToast('error', 'Tiket ini tidak memiliki nomor WhatsApp penerima');
      return;
    }

    setSendingTicketId(ticketId);
    try {
      await api.post(`/api/eo/tickets/${ticketId}/send`, { channel });
      toast.showToast('success', `Tiket dikirim via ${channel === 'email' ? 'email' : 'WhatsApp'}`);
      await refreshTickets();
    } catch (err) {
      toast.showToast('error', getApiError(err).error);
    } finally {
      setSendingTicketId(null);
    }
  };

  const copyQr = async (ticket: InternalTicket) => {
    const value = ticket.qrImageUrl || ticket.ticketCode;
    await navigator.clipboard.writeText(value || '');
    toast.showToast('success', 'QR berhasil disalin');
  };

  if (!canGenerate) {
    return null;
  }

  if (canGenerate && permissionLoaded && !isOwner) {
    return (
      <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="rounded-3xl border border-dashed border-slate-200 bg-slate-50 px-6 py-10 text-center dark:border-slate-800 dark:bg-slate-950">
          <p className="text-lg font-semibold text-slate-900 dark:text-white">Generate ticket panel tidak tersedia</p>
          <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">
            Panel ini hanya bisa dibuka oleh EO Admin untuk event yang sedang dipilih.
          </p>
        </div>
      </section>
    );
  }

  if (canGenerate && permissionLoaded && isOwner && internalCategories.length === 0) {
    return null;
  }

  return (
    <section className="rounded-[2rem] border border-slate-200 bg-white p-6 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
      <div className="flex flex-col gap-4 border-b border-slate-200 pb-5 dark:border-slate-800 lg:flex-row lg:items-end lg:justify-between">
        <div className="max-w-2xl">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
            <Ticket className="h-3.5 w-3.5" />
            Internal Tickets
          </div>
          <h2 className="text-xl font-semibold tracking-tight text-slate-900 dark:text-white">
            Generate Internal Ticket
          </h2>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            Buat tiket internal untuk staff, crew, sponsor, atau VIP tanpa payment flow.
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" onClick={loadData} className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <RefreshCcw className="mr-2 h-4 w-4" />
            Refresh
          </Button>
          <Button variant="outline" onClick={exportCsv} className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <ArrowDownToLine className="mr-2 h-4 w-4" />
            Export CSV
          </Button>
          <Button variant="outline" onClick={bulkDownloadPdf} className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950">
            <FileUp className="mr-2 h-4 w-4" />
            Download PDFs
          </Button>
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-sm text-slate-500">Memuat data internal ticket...</div>
      ) : error ? (
        <div className="mt-4 rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/60 dark:bg-red-950/30 dark:text-red-300">
          {error}
        </div>
      ) : null}

      {successMessage ? (
        <div className="mt-4 rounded-2xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700 dark:border-emerald-900/60 dark:bg-emerald-950/30 dark:text-emerald-300">
          {successMessage}
        </div>
      ) : null}

      <div className="mt-5 grid gap-4 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-4">
          <div className="rounded-3xl bg-slate-50 p-5 dark:bg-slate-950">
            <div className="grid gap-4 md:grid-cols-2">
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-900 dark:text-white">
                  Select Category
                </label>
                <select
                  value={selectedCategoryId}
                  onChange={e => setSelectedCategoryId(e.target.value)}
                  className="w-full rounded-2xl border border-slate-200 bg-white px-4 py-3 text-sm text-slate-900 outline-none focus:border-emerald-500 focus:ring-4 focus:ring-emerald-500/10 dark:border-slate-700 dark:bg-slate-950 dark:text-white"
                >
                  <option value="">Pilih kategori internal</option>
                  {internalCategories.map(category => (
                    <option key={category.id} value={category.id}>
                      {category.name} ({category.sold}/{category.quota})
                    </option>
                  ))}
                </select>
              </div>

              <Input
                type="number"
                min={1}
                label="Quantity"
                value={quantity}
                onChange={e => setQuantity(Math.min(Math.max(1, parseInt(e.target.value, 10) || 1), Math.max(remainingQuota, 1)))}
                disabled={attendees.length > 0}
                hint={attendees.length > 0 ? 'Quantity mengikuti jumlah attendee manual' : `Sisa kuota kategori: ${remainingQuota}`}
              />
            </div>

            <div className="mt-5 flex flex-wrap gap-2">
              <Button
                variant="outline"
                onClick={addRow}
                className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
              >
                <Plus className="mr-2 h-4 w-4" />
                Add Attendee
              </Button>
              <Button
                variant="outline"
                onClick={() => fileInputRef.current?.click()}
                className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
              >
                <FileUp className="mr-2 h-4 w-4" />
                Upload CSV
              </Button>
              <Button
                variant="outline"
                onClick={downloadCsvTemplate}
                className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
              >
                <ArrowDownToLine className="mr-2 h-4 w-4" />
                CSV Template
              </Button>
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv,text/csv"
                className="hidden"
                onChange={async e => {
                  const input = e.currentTarget;
                  const file = e.target.files?.[0];
                  if (file) {
                    await handleCsvUpload(file);
                  }
                  input.value = '';
                }}
              />
            </div>

            <div className="mt-5 space-y-3">
              {attendees.length === 0 ? (
                <div className="rounded-2xl border border-dashed border-slate-200 bg-white p-4 text-sm text-slate-500 dark:border-slate-800 dark:bg-slate-900">
                  Kosongkan attendee jika ingin auto-generate data internal guest.
                </div>
              ) : (
                attendees.map((row, index) => (
                  <div
                    key={row.id}
                    className="grid gap-3 rounded-2xl border border-slate-200 bg-gradient-to-br from-white to-slate-50 p-4 shadow-sm dark:border-slate-800 dark:from-slate-900 dark:to-slate-950 md:items-end md:grid-cols-[minmax(0,1.25fr)_minmax(0,1fr)_minmax(0,1fr)_auto]"
                  >
                    <div className="min-w-0">
                      <Input
                        label={`Name #${index + 1}`}
                        value={row.name}
                        onChange={e => updateRow(index, 'name', e.target.value)}
                        placeholder="Nama peserta"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="min-w-0">
                      <Input
                        label="Email"
                        value={row.email}
                        onChange={e => updateRow(index, 'email', e.target.value)}
                        placeholder="email@domain.com"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="min-w-0">
                      <Input
                        label="Phone"
                        value={row.phone}
                        onChange={e => updateRow(index, 'phone', e.target.value)}
                        placeholder="08xxxxxxxx"
                        className="rounded-xl"
                      />
                    </div>
                    <div className="flex items-end md:justify-end">
                      <Button
                        variant="ghost"
                        onClick={() => removeRow(index)}
                        className="h-11 rounded-2xl border border-slate-200 bg-white text-slate-500 hover:bg-red-50 hover:text-red-600 dark:border-slate-700 dark:bg-slate-950 dark:hover:bg-red-500/10"
                      >
                        <X className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))
              )}
            </div>

            <div className="mt-5 flex justify-end">
              <Button
                onClick={handleGenerate}
                disabled={saving || !selectedCategoryId || remainingQuota <= 0}
                className="rounded-2xl bg-emerald-600 px-5 text-white shadow-md shadow-emerald-600/20 hover:bg-emerald-700"
              >
                {saving ? 'Generating...' : 'Generate Ticket'}
              </Button>
            </div>
          </div>
        </div>

        <div className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-950">
          <div className="flex items-center justify-between gap-3">
            <div>
              <p className="text-sm font-semibold text-slate-900 dark:text-white">Internal Categories</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {internalCategories.length} kategori internal terdeteksi
              </p>
            </div>
            <div className="flex h-10 w-10 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-600 dark:bg-emerald-500/10">
              <Users className="h-4 w-4" />
            </div>
          </div>

          <div className="mt-4 space-y-3">
            {internalCategories.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-slate-200 p-4 text-sm text-slate-500 dark:border-slate-800">
                Belum ada kategori internal untuk event ini.
              </div>
            ) : (
              internalCategories.map(category => (
                <div key={category.id} className="rounded-2xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-900">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900 dark:text-white">{category.name}</p>
                      <p className="text-xs text-slate-500 dark:text-slate-400">
                        {category.sold} / {category.quota} terpakai
                      </p>
                    </div>
                    <span
                      className="inline-block h-4 w-4 rounded-full border border-slate-300 dark:border-slate-600"
                      style={{ backgroundColor: category.colorHex || '#0f766e' }}
                    />
                  </div>
                  <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-800">
                    <div
                      className="h-full rounded-full bg-gradient-to-r from-emerald-500 to-teal-500"
                      style={{ width: `${Math.min(100, Math.round((category.sold / Math.max(category.quota, 1)) * 100))}%` }}
                    />
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="mt-6 rounded-3xl border border-slate-200 bg-white p-5 shadow-sm shadow-slate-200/40 dark:border-slate-800 dark:bg-slate-900/80">
        <div className="flex flex-col gap-3 border-b border-slate-200 pb-4 dark:border-slate-800 md:flex-row md:items-end md:justify-between">
          <div>
            <h3 className="text-lg font-semibold tracking-tight text-slate-900 dark:text-white">
              Generated Tickets
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
              Ticket yang sudah dibuat manual akan muncul di tabel ini.
            </p>
          </div>
        </div>

        <div className="mt-5 overflow-hidden rounded-3xl border border-slate-200 dark:border-slate-800">
          <div className="overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-50 dark:bg-slate-950">
                <tr className="text-left">
                  <th className="px-4 py-3 font-medium text-slate-500">Ticket Code</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Name</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Category</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Status</th>
                  <th className="px-4 py-3 font-medium text-slate-500">Source</th>
                  <th className="px-4 py-3 font-medium text-slate-500 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {tickets.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-4 py-12 text-center text-slate-500">
                      Belum ada internal ticket yang digenerate.
                    </td>
                  </tr>
                ) : (
                  tickets.map(ticket => (
                    <tr key={ticket.id} className="hover:bg-slate-50/70 dark:hover:bg-slate-900/60">
                      <td className="px-4 py-4 font-semibold text-slate-900 dark:text-white">
                        <div className="flex items-center gap-2">
                          <QrCode className="h-4 w-4 text-slate-400" />
                          {ticket.ticketCode}
                        </div>
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{ticket.holderName}</td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-300">{ticket.category?.name || '-'}</td>
                      <td className="px-4 py-4">
                        <span className="inline-flex rounded-full bg-emerald-50 px-3 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300">
                          {ticket.status}
                        </span>
                      </td>
                      <td className="px-4 py-4 text-slate-700 dark:text-slate-300">
                        {ticket.source === 'MANUAL' ? 'Manual' : ticket.source}
                      </td>
                      <td className="px-4 py-4">
                        <div className="flex flex-wrap justify-end gap-2">
                          <Button
                            variant="outline"
                            className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                            onClick={() => copyQr(ticket)}
                          >
                            <Copy className="mr-2 h-4 w-4" />
                            Copy QR
                          </Button>
                          <Button
                            variant="outline"
                            className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                            onClick={() => sendTicket(ticket.id, 'email')}
                            disabled={sendingTicketId === ticket.id || !ticket.holderEmail}
                          >
                            <Mail className="mr-2 h-4 w-4" />
                            {sendingTicketId === ticket.id ? 'Sending...' : 'Kirim Email'}
                          </Button>
                          <Button
                            variant="outline"
                            className="border-slate-200 bg-white dark:border-slate-700 dark:bg-slate-950"
                            onClick={() => sendTicket(ticket.id, 'whatsapp')}
                            disabled={sendingTicketId === ticket.id || !ticket.holderPhone}
                          >
                            <MessageSquare className="mr-2 h-4 w-4" />
                            {sendingTicketId === ticket.id ? 'Sending...' : 'Kirim WA'}
                          </Button>
                          {ticket.pdfUrl ? (
                            <a
                              href={withCacheBuster(normalizePublicUrl(ticket.pdfUrl), ticket.generatedAt || ticket.createdAt)}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex items-center justify-center rounded-2xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 transition-colors hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:hover:bg-slate-900"
                            >
                              <ArrowDownToLine className="mr-2 h-4 w-4" />
                              PDF
                            </a>
                          ) : null}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

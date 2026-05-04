'use client';

import { useState, useEffect, useRef } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import TicketSelection from '@/components/checkout/TicketSelection';
import BuyerForm from '@/components/checkout/BuyerForm';
import AttendeeForm from '@/components/checkout/AttendeeForm';
import OrderSummary from '@/components/checkout/OrderSummary';
import { Button, Card } from '@/components/ui';
import { PublicNavbar } from '@/components/PublicNavbar';
import { getApiError } from '@/lib/api';
import { ensureMidtransSnap } from '@/lib/midtrans';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
  saleStartAt?: string;
}

interface Event {
  id: string;
  title: string;
  slug: string;
  startDate: string;
  venue?: { name: string };
}

export default function CheckoutPage() {
  const params = useParams();
  const router = useRouter();
  const eventSlug = params.eventSlug as string;
  const { isLoggedIn } = useAuthStore();
  const queryClient = useQueryClient();

  const {
    data: categories,
    isLoading: categoriesLoading,
    isError: categoriesError,
    error: categoriesErrorData,
    refetch: refetchCategories,
  } = useQuery({
    queryKey: ['ticket-categories', eventSlug],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventSlug}/ticket-categories`);
      const rows = (res.data || []) as Array<TicketCategory & { isInternal?: boolean }>;
      return rows.filter((c) => c.isInternal !== true) as TicketCategory[];
    },
    refetchInterval: 15000,
  });

  const { data: event, isLoading: eventLoading, isError: eventError, error: eventErrorData } = useQuery({
    queryKey: ['event', eventSlug],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventSlug}`);
      return res.data as Event;
    },
  });

  // State for selections
  const [selectedItems, setSelectedItems] = useState<{ categoryId: string; qty: number }[]>([]);
  const [buyerData, setBuyerData] = useState({ name: '', email: '', phone: '' });
  const [attendees, setAttendees] = useState<string[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [checkoutError, setCheckoutError] = useState('');
  const [stockWarning, setStockWarning] = useState('');
  const { user } = useAuthStore();
  const idempotencyKeyRef = useRef<string>(crypto.randomUUID());

  // Auto-fill buyer data from user on mount
  useEffect(() => {
    if (user && !buyerData.name && !buyerData.email && !buyerData.phone) {
      setBuyerData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user, buyerData.name, buyerData.email, buyerData.phone]);

  useEffect(() => {
    if (!categories) return;
    setSelectedItems((prev) => {
      let changed = false;
      const next = prev
        .map((item) => {
          const category = categories.find((c) => c.id === item.categoryId);
          if (!category) {
            changed = true;
            return null;
          }
          const cap = Math.max(0, Math.min(category.available, category.maxPerOrder));
          const qty = Math.min(item.qty, cap);
          if (qty <= 0) {
            changed = true;
            return null;
          }
          if (qty !== item.qty) changed = true;
          return { categoryId: item.categoryId, qty };
        })
        .filter(Boolean) as { categoryId: string; qty: number }[];
      if (changed) {
        setStockWarning('Stok berubah, pilihan tiket disesuaikan. Silakan cek ulang.');
      }
      return changed ? next : prev;
    });
  }, [categories]);

  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.qty, 0);

  const handleSubmitOrder = async () => {
    if (isSubmitting) return;
    if (!event || selectedItems.length === 0 || !buyerData.name) return;

    setIsSubmitting(true);
    setCheckoutError('');
    setStockWarning('');
    try {
      const latestRes = await refetchCategories();
      const latestCategories = (latestRes.data || queryClient.getQueryData(['ticket-categories', eventSlug]) || []) as TicketCategory[];
      const invalidItem = selectedItems.find((item) => {
        const category = latestCategories.find((c) => c.id === item.categoryId);
        if (!category) return true;
        const isUnavailable = category.status === 'SOLD_OUT' || category.status === 'UPCOMING' || category.status === 'CLOSED' || category.status?.toLowerCase() === 'close';
        if (isUnavailable) return true;
        if (item.qty > category.available) return true;
        if (item.qty > category.maxPerOrder) return true;
        return false;
      });
      if (invalidItem) {
        setStockWarning('Stok berubah, silakan cek ulang sebelum melanjutkan pembayaran.');
        return;
      }

      const orderData = {
        eventSlug,
        items: selectedItems,
        buyer: buyerData,
        attendees: totalQuantity > 1 ? attendees : [],
        paymentMethod: 'midtrans',
        idempotencyKey: idempotencyKeyRef.current,
      };

      const res = await api.post('/api/orders', orderData);
      const { orderId, paymentToken, paymentUrl } = res.data;

      console.log('[Checkout] Payment response:', { orderId, paymentToken, paymentUrl });

      const snap = typeof paymentToken === 'string' ? await ensureMidtransSnap() : null;

      if (typeof paymentToken === 'string' && snap?.pay) {
        snap.pay(paymentToken, {
          onSuccess: () => router.push(`/checkout/${eventSlug}/success?orderId=${orderId}`),
          onPending: () => router.refresh(),
          onError: (err: any) => {
            console.error('Payment failed:', err);
            setCheckoutError('Pembayaran gagal. Silakan coba lagi.');
          },
        });
      } else if (paymentUrl) {
        // Fallback to redirect if token not available or Snap not loaded
        window.location.href = paymentUrl;
      } else {
        setCheckoutError('Gagal inisialisasi pembayaran. Silakan coba lagi.');
      }
    } catch (error: any) {
      const apiError = getApiError(error);
      if (apiError.code === 'QUOTA_EXCEEDED' || apiError.error.toLowerCase().includes('stock') || apiError.error.toLowerCase().includes('quota')) {
        setStockWarning('Stok berubah, silakan cek ulang.');
        await refetchCategories();
      } else {
        setCheckoutError(apiError.error || 'Terjadi kesalahan, coba lagi.');
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  useEffect(() => {
    if (!isLoggedIn) {
      router.push(`/login?redirect=/checkout/${eventSlug}`);
    }
  }, [isLoggedIn, router, eventSlug]);

  if (!isLoggedIn) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Checking authentication...</p>
        </div>
      </div>
    );
  }

  if (categoriesLoading || eventLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
          <p className="text-gray-600">Loading checkout...</p>
        </div>
      </div>
    );
  }

  if (categoriesError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p>Failed to load ticket categories: {categoriesErrorData?.message || 'Unknown error'}</p>
          <Button className="mt-3" onClick={() => refetchCategories()}>Coba Lagi</Button>
        </Card>
      </div>
    );
  }

  if (eventError) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Card className="p-6">
          <h2 className="text-xl font-bold text-red-600 mb-2">Error</h2>
          <p>Failed to load event: {eventErrorData?.message || 'Unknown error'}</p>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <PublicNavbar />
      <div className="container mx-auto px-4 py-8">
        {checkoutError ? (
          <div className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {checkoutError}
          </div>
        ) : null}
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <TicketSelection
              categories={categories || []}
              selectedItems={selectedItems}
              onSelectionChange={setSelectedItems}
              disabled={isSubmitting}
            />
            <BuyerForm
              data={buyerData}
              onChange={setBuyerData}
            />
            {totalQuantity > 1 && (
              <AttendeeForm
                quantity={totalQuantity}
                attendees={attendees}
                onChange={setAttendees}
              />
            )}
          </div>
          <div className="lg:col-span-2">
            <OrderSummary
              event={event}
              selectedItems={selectedItems}
              categories={categories || []}
              buyerData={buyerData}
              attendees={attendees}
              onSubmit={handleSubmitOrder}
              onMobileSubmit={handleSubmitOrder}
              showMobileCta
              stockWarning={stockWarning}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
        <div className="h-20 lg:hidden" />
      </div>
    </div>
  );
}

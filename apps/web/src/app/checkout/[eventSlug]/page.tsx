'use client';

import { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import TicketSelection from '@/components/checkout/TicketSelection';
import BuyerForm from '@/components/checkout/BuyerForm';
import AttendeeForm from '@/components/checkout/AttendeeForm';
import PaymentMethod from '@/components/checkout/PaymentMethod';
import OrderSummary from '@/components/checkout/OrderSummary';
import { Card } from '@/components/ui';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
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

  const { data: categories, isLoading: categoriesLoading, isError: categoriesError, error: categoriesErrorData } = useQuery({
    queryKey: ['ticket-categories', eventSlug],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventSlug}/ticket-categories`);
      return res.data as TicketCategory[];
    },
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
  const [paymentMethod, setPaymentMethod] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const { user } = useAuthStore();

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

  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.qty, 0);

  const handleSubmitOrder = async () => {
    if (!event || selectedItems.length === 0 || !buyerData.name || !paymentMethod) return;

    setIsSubmitting(true);
    try {
      const orderData = {
        eventSlug,
        items: selectedItems,
        buyer: buyerData,
        attendees: totalQuantity > 1 ? attendees : [],
        paymentMethod,
      };

      const res = await api.post('/api/orders', orderData);
      const { orderId, paymentUrl } = res.data;

      if (paymentUrl) {
        window.location.href = paymentUrl;
      } else {
        router.push(`/checkout/${eventSlug}/success?orderId=${orderId}`);
      }
    } catch (error) {
      console.error('Order creation failed:', error);
      // Handle error
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
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3 space-y-6">
            <TicketSelection
              categories={categories || []}
              selectedItems={selectedItems}
              onSelectionChange={setSelectedItems}
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
            <PaymentMethod
              selected={paymentMethod}
              onChange={setPaymentMethod}
            />
          </div>
          <div className="lg:col-span-2">
            <OrderSummary
              event={event}
              selectedItems={selectedItems}
              categories={categories || []}
              buyerData={buyerData}
              attendees={attendees}
              paymentMethod={paymentMethod}
              onSubmit={handleSubmitOrder}
              isSubmitting={isSubmitting}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
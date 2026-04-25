'use client';

import { useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuthStore } from '@/store/authStore';
import TicketSelection from '@/components/checkout/TicketSelection';
import BuyerForm from '@/components/checkout/BuyerForm';
import AttendeeForm from '@/components/checkout/AttendeeForm';
import PaymentMethod from '@/components/checkout/PaymentMethod';
import OrderSummary from '@/components/checkout/OrderSummary';
import { Button } from '@/components/ui/button';
import { Loader2 } from 'lucide-react';

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

  const { data: categories, isLoading: categoriesLoading } = useQuery({
    queryKey: ['ticket-categories', eventSlug],
    queryFn: async () => {
      const res = await api.get(`/api/events/${eventSlug}/ticket-categories`);
      return res.data as TicketCategory[];
    },
  });

  const { data: event } = useQuery({
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

  const totalQuantity = selectedItems.reduce((sum, item) => sum + item.qty, 0);

  if (!isLoggedIn) {
    router.push(`/login?redirect=/checkout/${eventSlug}`);
    return null;
  }

  if (categoriesLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin" />
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-5 gap-8">
          <div className="lg:col-span-3">
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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
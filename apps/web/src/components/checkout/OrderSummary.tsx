'use client';

'use client';

import { forwardRef, HTMLAttributes } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

interface SeparatorProps extends HTMLAttributes<HTMLDivElement> {}

const Separator = forwardRef<HTMLDivElement, SeparatorProps>(
  ({ className = '', ...props }, ref) => {
    return (
      <div
        ref={ref}
        className={`h-px bg-slate-200 dark:bg-slate-700 ${className}`}
        {...props}
      />
    );
  }
);
Separator.displayName = 'Separator';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
}

interface Event {
  id: string;
  title: string;
  slug: string;
  startDate: string;
  venue?: { name: string };
}

interface OrderSummaryProps {
  event?: Event;
  selectedItems: { categoryId: string; qty: number }[];
  categories: TicketCategory[];
  buyerData: { name: string; email: string; phone: string };
  attendees: string[];
  paymentMethod: string;
  onSubmit?: () => void;
  isSubmitting?: boolean;
}

export default function OrderSummary({
  event,
  selectedItems,
  categories,
  buyerData,
  attendees,
  paymentMethod,
  onSubmit,
  isSubmitting,
}: OrderSummaryProps) {
  const subtotal = selectedItems.reduce((sum, item) => {
    const category = categories.find(c => c.id === item.categoryId);
    return sum + (category?.price || 0) * item.qty;
  }, 0);

  const serviceFee = Math.round(subtotal * 0.02); // 2% service fee
  const total = subtotal + serviceFee;

  const isValid =
    selectedItems.length > 0 &&
    buyerData.name &&
    buyerData.email &&
    buyerData.phone &&
    paymentMethod &&
    attendees.every(name => name.trim());

  const formatCurrency = (amount: number) =>
    new Intl.NumberFormat('id-ID', { style: 'currency', currency: 'IDR' }).format(amount);

  return (
    <div className="lg:sticky lg:top-4">
      <Card>
        <CardHeader>
          <CardTitle>Ringkasan Pesanan</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          {event && (
            <div>
              <h3 className="font-semibold">{event.title}</h3>
              <p className="text-sm text-gray-500">
                {new Date(event.startDate).toLocaleDateString('id-ID')}
              </p>
              {event.venue && (
                <p className="text-sm text-gray-500">{event.venue.name}</p>
              )}
            </div>
          )}

          <Separator />

          <div className="space-y-2">
            {selectedItems.map(item => {
              const category = categories.find(c => c.id === item.categoryId);
              if (!category) return null;
              return (
                <div key={item.categoryId} className="flex justify-between text-sm">
                  <span>{category.name} x{item.qty}</span>
                  <span>{formatCurrency(category.price * item.qty)}</span>
                </div>
              );
            })}
          </div>

          <Separator />

          <div className="space-y-2">
            <div className="flex justify-between text-sm">
              <span>Subtotal</span>
              <span>{formatCurrency(subtotal)}</span>
            </div>
            <div className="flex justify-between text-sm">
              <span>Biaya Layanan</span>
              <span>{formatCurrency(serviceFee)}</span>
            </div>
            <Separator />
            <div className="flex justify-between font-bold text-lg">
              <span>Total</span>
              <span>{formatCurrency(total)}</span>
            </div>
          </div>

          <Button
            className="w-full"
            disabled={!isValid || isSubmitting}
            onClick={onSubmit}
            size="lg"
          >
            {isSubmitting ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
                Memproses...
              </>
            ) : (
              'Bayar Sekarang'
            )}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
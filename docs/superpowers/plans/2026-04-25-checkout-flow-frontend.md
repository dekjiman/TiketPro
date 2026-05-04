# Checkout Flow Frontend Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implement a modern, mobile-first checkout flow for event ticket purchasing with category selection, buyer data collection, attendee data (if multiple tickets), payment method selection, and success page.

**Architecture:** Single-page scrollable checkout with sticky order summary, using React Query for API calls, Zod for validation, and Tailwind for styling. Route structure: /checkout/[eventSlug] and /checkout/[eventSlug]/success. Backend API will be updated to support eventSlug-based orders with multiple items.

**Tech Stack:** Next.js 14 (App Router), TypeScript, Tailwind CSS, React Hook Form, Zod, TanStack Query, Lucide React icons.

---

### Task 1: Update Event Detail Page to Navigate to New Checkout

**Files:**
- Modify: `apps/web/src/app/events/[slug]/page.tsx`

- [ ] **Step 1: Update handleSelectTicket to navigate to /checkout/[slug]**

Change the button click handler from `/checkout/${ticketId}` to `/checkout/${slug}`, since checkout will select categories.

```typescript
const handleBuyTickets = () => {
  if (!isLoggedIn) {
    router.push(`/login?redirect=/checkout/${slug}`);
    return;
  }
  router.push(`/checkout/${slug}`);
};
```

- [ ] **Step 2: Update mobile CTA button to use new handler**

Change the bottom CTA button to call handleBuyTickets instead of handleScrollToTickets.

- [ ] **Step 3: Commit changes**

```bash
git add apps/web/src/app/events/[slug]/page.tsx
git commit -m "feat: update event detail to navigate to new checkout route"
```

### Task 2: Create Checkout Page Route and Basic Structure

**Files:**
- Create: `apps/web/src/app/checkout/[eventSlug]/page.tsx`

- [ ] **Step 1: Create the checkout page file with basic structure**

```typescript
'use client';

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
            />
          </div>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Commit the new checkout page**

```bash
git add apps/web/src/app/checkout/[eventSlug]/page.tsx
git commit -m "feat: create basic checkout page structure"
```

### Task 3: Implement TicketSelection Component

**Files:**
- Create: `apps/web/src/components/checkout/TicketSelection.tsx`

- [ ] **Step 1: Create TicketSelection component with category list and quantity selectors**

```typescript
'use client';

import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Minus, Plus } from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
  available: number;
  maxPerOrder: number;
  status: string;
}

interface TicketSelectionProps {
  categories: TicketCategory[];
  selectedItems: { categoryId: string; qty: number }[];
  onSelectionChange: (items: { categoryId: string; qty: number }[]) => void;
}

export default function TicketSelection({ categories, selectedItems, onSelectionChange }: TicketSelectionProps) {
  const updateQuantity = (categoryId: string, newQty: number) => {
    const updated = selectedItems.filter(item => item.categoryId !== categoryId);
    if (newQty > 0) {
      updated.push({ categoryId, qty: newQty });
    }
    onSelectionChange(updated);
  };

  const getQuantity = (categoryId: string) => {
    return selectedItems.find(item => item.categoryId === categoryId)?.qty || 0;
  };

  const getBadgeInfo = (category: TicketCategory) => {
    if (category.status === 'SOLD_OUT') return { text: 'Stok Habis', class: 'bg-gray-100 text-gray-500' };
    if (category.status === 'UPCOMING') return { text: 'Belum Dibuka', class: 'bg-yellow-100 text-yellow-700' };
    if (category.available <= 10) return { text: `Tersisa ${category.available}`, class: 'bg-red-100 text-red-600' };
    return { text: 'Tersedia', class: 'bg-green-100 text-green-700' };
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Pilih Tiket</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="space-y-4">
          {categories.map(category => {
            const qty = getQuantity(category.id);
            const badge = getBadgeInfo(category);
            const isDisabled = category.status === 'SOLD_OUT' || category.status === 'UPCOMING';
            
            return (
              <div key={category.id} className="flex items-center justify-between p-4 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="font-semibold">{category.name}</h3>
                    <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge.class}`}>
                      {badge.text}
                    </span>
                  </div>
                  <p className="text-lg font-bold text-emerald-600">
                    {category.price === 0 ? 'FREE' : `Rp${category.price.toLocaleString('id-ID')}`}
                  </p>
                  <p className="text-sm text-gray-500">Max per order: {category.maxPerOrder}</p>
                </div>
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(category.id, Math.max(0, qty - 1))}
                    disabled={isDisabled || qty <= 0}
                  >
                    <Minus className="w-4 h-4" />
                  </Button>
                  <span className="w-8 text-center">{qty}</span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateQuantity(category.id, Math.min(category.maxPerOrder, category.available, qty + 1))}
                    disabled={isDisabled || qty >= category.maxPerOrder || qty >= category.available}
                  >
                    <Plus className="w-4 h-4" />
                  </Button>
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit the TicketSelection component**

```bash
git add apps/web/src/components/checkout/TicketSelection.tsx
git commit -m "feat: implement TicketSelection component with quantity controls"
```

### Task 4: Implement BuyerForm Component

**Files:**
- Create: `apps/web/src/components/checkout/BuyerForm.tsx`

- [ ] **Step 1: Create BuyerForm component with validation**

```typescript
'use client';

import { useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useAuthStore } from '@/store/authStore';

const buyerSchema = z.object({
  name: z.string().min(2, 'Nama minimal 2 karakter'),
  email: z.string().email('Email tidak valid'),
  phone: z.string().min(10, 'Nomor WhatsApp tidak valid'),
});

type BuyerFormData = z.infer<typeof buyerSchema>;

interface BuyerFormProps {
  data: { name: string; email: string; phone: string };
  onChange: (data: { name: string; email: string; phone: string }) => void;
}

export default function BuyerForm({ data, onChange }: BuyerFormProps) {
  const { user } = useAuthStore();
  
  const { register, watch, formState: { errors } } = useForm<BuyerFormData>({
    resolver: zodResolver(buyerSchema),
    defaultValues: data,
  });

  const watchedData = watch();

  useEffect(() => {
    onChange(watchedData);
  }, [watchedData, onChange]);

  useEffect(() => {
    if (user && !data.name) {
      onChange({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
      });
    }
  }, [user, data.name, onChange]);

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Pembeli</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="name">Nama Lengkap *</Label>
          <Input
            id="name"
            {...register('name')}
            placeholder="Masukkan nama lengkap"
          />
          {errors.name && <p className="text-sm text-red-500 mt-1">{errors.name.message}</p>}
        </div>
        
        <div>
          <Label htmlFor="email">Email *</Label>
          <Input
            id="email"
            type="email"
            {...register('email')}
            placeholder="email@example.com"
          />
          {errors.email && <p className="text-sm text-red-500 mt-1">{errors.email.message}</p>}
        </div>
        
        <div>
          <Label htmlFor="phone">Nomor WhatsApp *</Label>
          <Input
            id="phone"
            {...register('phone')}
            placeholder="628xxxxxxxxx"
          />
          {errors.phone && <p className="text-sm text-red-500 mt-1">{errors.phone.message}</p>}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit the BuyerForm component**

```bash
git add apps/web/src/components/checkout/BuyerForm.tsx
git commit -m "feat: implement BuyerForm component with validation"
```

### Task 5: Implement AttendeeForm Component

**Files:**
- Create: `apps/web/src/components/checkout/AttendeeForm.tsx`

- [ ] **Step 1: Create AttendeeForm component for multiple tickets**

```typescript
'use client';

import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AttendeeFormProps {
  quantity: number;
  attendees: string[];
  onChange: (attendees: string[]) => void;
}

export default function AttendeeForm({ quantity, attendees, onChange }: AttendeeFormProps) {
  const { control, watch } = useForm({
    defaultValues: { attendees: attendees.map(name => ({ name })) },
  });

  const { fields } = useFieldArray({
    control,
    name: 'attendees',
  });

  const watchedAttendees = watch('attendees');

  useEffect(() => {
    const names = watchedAttendees?.map(a => a.name || '') || [];
    onChange(names);
  }, [watchedAttendees, onChange]);

  if (quantity <= 1) return null;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Data Peserta</CardTitle>
        <p className="text-sm text-gray-600">Masukkan nama untuk setiap tiket</p>
      </CardHeader>
      <CardContent className="space-y-4">
        {Array.from({ length: quantity }, (_, i) => (
          <div key={i}>
            <Label htmlFor={`attendee-${i}`}>Tiket {i + 1}</Label>
            <Input
              id={`attendee-${i}`}
              {...control.register(`attendees.${i}.name`)}
              placeholder="Nama peserta"
              defaultValue={attendees[i] || ''}
            />
          </div>
        ))}
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit the AttendeeForm component**

```bash
git add apps/web/src/components/checkout/AttendeeForm.tsx
git commit -m "feat: implement AttendeeForm component for multiple attendees"
```

### Task 6: Implement PaymentMethod Component

**Files:**
- Create: `apps/web/src/components/checkout/PaymentMethod.tsx`

- [ ] **Step 1: Create PaymentMethod component with options**

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Check } from 'lucide-react';

const paymentMethods = [
  { id: 'qris', name: 'QRIS', description: 'Bayar dengan QR code', icon: '💳' },
  { id: 'bank_transfer', name: 'Transfer Bank', description: 'Transfer ke rekening bank', icon: '🏦' },
  { id: 'e_wallet', name: 'E-Wallet', description: 'GoPay, OVO, Dana, dll', icon: '📱' },
  { id: 'virtual_account', name: 'Virtual Account', description: 'BCA, Mandiri, BNI, dll', icon: '🏢' },
];

interface PaymentMethodProps {
  selected: string;
  onChange: (method: string) => void;
}

export default function PaymentMethod({ selected, onChange }: PaymentMethodProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>Metode Pembayaran</CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {paymentMethods.map(method => (
            <Button
              key={method.id}
              variant={selected === method.id ? 'default' : 'outline'}
              className="h-auto p-4 justify-start"
              onClick={() => onChange(method.id)}
            >
              <div className="flex items-center gap-3">
                <span className="text-2xl">{method.icon}</span>
                <div className="text-left">
                  <p className="font-semibold">{method.name}</p>
                  <p className="text-sm opacity-80">{method.description}</p>
                </div>
                {selected === method.id && <Check className="w-5 h-5 ml-auto" />}
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
```

- [ ] **Step 2: Commit the PaymentMethod component**

```bash
git add apps/web/src/components/checkout/PaymentMethod.tsx
git commit -m "feat: implement PaymentMethod component with options"
```

### Task 7: Implement OrderSummary Component

**Files:**
- Create: `apps/web/src/components/checkout/OrderSummary.tsx`

- [ ] **Step 1: Create OrderSummary component with sticky positioning**

```typescript
'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Separator } from '@/components/ui/separator';
import { Loader2 } from 'lucide-react';

interface TicketCategory {
  id: string;
  name: string;
  price: number;
}

interface Event {
  id: string;
  title: string;
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
}

export default function OrderSummary({
  event,
  selectedItems,
  categories,
  buyerData,
  attendees,
  paymentMethod,
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
            disabled={!isValid}
            size="lg"
          >
            Bayar Sekarang
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit the OrderSummary component**

```bash
git add apps/web/src/components/checkout/OrderSummary.tsx
git commit -m "feat: implement OrderSummary component with calculations"
```

### Task 8: Implement Success Page

**Files:**
- Create: `apps/web/src/app/checkout/[eventSlug]/success/page.tsx`

- [ ] **Step 1: Create success page with order details**

```typescript
'use client';

import { useParams, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { CheckCircle, Download, Ticket, Share2 } from 'lucide-react';

export default function CheckoutSuccessPage() {
  const params = useParams();
  const searchParams = useSearchParams();
  const eventSlug = params.eventSlug as string;
  const orderId = searchParams.get('orderId');

  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-4">
      <Card className="max-w-md w-full">
        <CardContent className="pt-6">
          <div className="text-center space-y-6">
            <div className="w-16 h-16 bg-green-100 rounded-full flex items-center justify-center mx-auto">
              <CheckCircle className="w-8 h-8 text-green-600" />
            </div>
            
            <div>
              <h1 className="text-2xl font-bold text-gray-900">Pembayaran Berhasil!</h1>
              <p className="text-gray-600 mt-2">
                Tiket Anda telah berhasil dibeli. E-tiket akan dikirim ke email Anda.
              </p>
            </div>

            {orderId && (
              <div className="bg-gray-50 p-4 rounded-lg">
                <p className="text-sm text-gray-500">Order ID</p>
                <p className="font-mono font-semibold">{orderId}</p>
              </div>
            )}

            <div className="space-y-3">
              <Button asChild className="w-full">
                <Link href="/my-tickets">
                  <Ticket className="w-4 h-4 mr-2" />
                  Lihat Tiket Saya
                </Link>
              </Button>
              
              <Button variant="outline" asChild className="w-full">
                <Link href={`/events/${eventSlug}`}>
                  <Share2 className="w-4 h-4 mr-2" />
                  Bagikan Event
                </Link>
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
```

- [ ] **Step 2: Commit the success page**

```bash
git add apps/web/src/app/checkout/[eventSlug]/success/page.tsx
git commit -m "feat: create checkout success page"
```

### Task 9: Integrate Order Creation and Payment Flow

**Files:**
- Modify: `apps/web/src/app/checkout/[eventSlug]/page.tsx`

- [ ] **Step 1: Add order creation logic to checkout page**

Add state for loading, and handle submit in OrderSummary.

Update the checkout page to handle form submission.

```typescript
// In CheckoutPage, add:
const [isSubmitting, setIsSubmitting] = useState(false);

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

// Pass handleSubmitOrder to OrderSummary
<OrderSummary
  // ... other props
  onSubmit={handleSubmitOrder}
  isSubmitting={isSubmitting}
/>
```

- [ ] **Step 2: Update OrderSummary to accept submit handler**

```typescript
interface OrderSummaryProps {
  // ... existing props
  onSubmit: () => void;
  isSubmitting: boolean;
}

// In component:
<Button
  className="w-full"
  disabled={!isValid || isSubmitting}
  onClick={onSubmit}
  size="lg"
>
  {isSubmitting ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null}
  {isSubmitting ? 'Memproses...' : 'Bayar Sekarang'}
</Button>
```

- [ ] **Step 3: Commit the integration**

```bash
git add apps/web/src/app/checkout/[eventSlug]/page.tsx
git add apps/web/src/components/checkout/OrderSummary.tsx
git commit -m "feat: integrate order creation and payment flow"
```

### Task 10: Update Backend API for New Checkout Flow

**Files:**
- Modify: `apps/api/src/routes/orders.ts` (assuming it exists)
- Create: `apps/api/src/routes/events/[slug]/ticket-categories.ts`

- [ ] **Step 1: Update POST /api/orders to handle new format**

Modify the order creation route to accept eventSlug, items array, buyer object, attendees array.

This requires updating the schema and logic to create Order with multiple OrderItems.

- [ ] **Step 2: Create GET /api/events/:slug/ticket-categories endpoint**

Return ticket categories for the event with availability.

- [ ] **Step 3: Commit backend changes**

```bash
git add apps/api/src/routes/orders.ts
git add apps/api/src/routes/events/[slug]/ticket-categories.ts
git commit -m "feat: update backend API for new checkout flow"
```

---

**Note:** Backend API implementation details depend on existing codebase. The above assumes standard Fastify setup. Adjust paths and implementations as needed.

**Testing:** After implementation, test the flow by:
1. Clicking "Beli Tiket" from event page
2. Selecting ticket quantities
3. Filling buyer data
4. Selecting payment method
5. Submitting order
6. Verifying redirect to payment or success page
'use client';

import { useEffect, useRef } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui';
import { Input } from '@/components/ui';
import { Label } from '@/components/ui';
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
  onSubmit?: (data: BuyerFormData) => void;
}

export default function BuyerForm({ data, onChange, onSubmit }: BuyerFormProps) {
  const { user } = useAuthStore();

  const { register, handleSubmit, watch, reset, formState: { errors } } = useForm<BuyerFormData>({
    resolver: zodResolver(buyerSchema),
    defaultValues: data,
  });

  // Sync internal form state when data prop changes from parent (e.g. auto-fill)
  useEffect(() => {
    const currentValues = watch();
    if (
      currentValues.name !== data.name ||
      currentValues.email !== data.email ||
      currentValues.phone !== data.phone
    ) {
      reset(data);
    }
  }, [data, reset, watch]);

  // Notify parent only when form values actually change and differ from current props
  useEffect(() => {
    const subscription = watch((value) => {
      const typedValue = value as BuyerFormData;
      if (
        typedValue.name !== data.name ||
        typedValue.email !== data.email ||
        typedValue.phone !== data.phone
      ) {
        onChange(typedValue);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, data, onChange]);

  const onFormSubmit = (formData: BuyerFormData) => {
    onSubmit?.(formData);
  };

  return (
    <form onSubmit={handleSubmit(onFormSubmit)}>
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
    </form>
  );
}
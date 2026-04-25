'use client';

import { useEffect } from 'react';
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
  onSubmit?: (data: { name: string; email: string; phone: string }) => void;
}

export default function BuyerForm({ data, onChange, onSubmit }: BuyerFormProps) {
  const { user } = useAuthStore();

  const { register, handleSubmit, watch, formState: { errors } } = useForm<BuyerFormData>({
    resolver: zodResolver(buyerSchema),
    defaultValues: data,
  });

  const watchedData = watch();

  useEffect(() => {
    onChange(watchedData);
  }, [watchedData, onChange]);

  useEffect(() => {
    // Improved auto-fill logic: only auto-fill if the field is empty and user data exists
    if (user) {
      const updates: Partial<typeof data> = {};
      if (!data.name && user.name) updates.name = user.name;
      if (!data.email && user.email) updates.email = user.email;
      if (!data.phone && user.phone) updates.phone = user.phone;

      if (Object.keys(updates).length > 0) {
        onChange({ ...data, ...updates });
      }
    }
  }, [user, data, onChange]);

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
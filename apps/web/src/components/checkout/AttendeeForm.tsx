'use client';

import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle, Input, Label } from '@/components/ui';

interface AttendeeFormProps {
  quantity: number;
  attendees: string[];
  onChange: (attendees: string[]) => void;
}

export default function AttendeeForm({ quantity, attendees, onChange }: AttendeeFormProps) {
  const { control, watch, reset } = useForm({
    defaultValues: { attendees: attendees.map(name => ({ name })) },
  });

  const { fields } = useFieldArray({
    control,
    name: 'attendees',
  });

  const watchedAttendees = watch('attendees');

  // Sync internal form state when attendees prop changes from parent
  useEffect(() => {
    const currentValues = watch('attendees');
    const currentNames = currentValues?.map(a => a?.name || '') || [];
    if (JSON.stringify(currentNames) !== JSON.stringify(attendees)) {
      reset({ attendees: attendees.map(name => ({ name })) });
    }
  }, [attendees, reset, watch]);

  // Notify parent only when values actually change
  useEffect(() => {
    const subscription = watch((value) => {
      const names = value.attendees?.map(a => a?.name || '') || [];
      if (JSON.stringify(names) !== JSON.stringify(attendees)) {
        onChange(names);
      }
    });
    return () => subscription.unsubscribe();
  }, [watch, attendees, onChange]);

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
'use client';

import { useEffect } from 'react';
import { useFieldArray, useForm } from 'react-hook-form';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/Card';
import { Input } from '@/components/ui/Input';
import { Label } from '@/components/ui/Label';

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
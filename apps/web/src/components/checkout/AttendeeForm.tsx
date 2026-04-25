import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface AttendeeFormProps {
  quantity: number;
  attendees: string[];
  onChange: (attendees: string[]) => void;
}

export default function AttendeeForm({ quantity, attendees, onChange }: AttendeeFormProps) {
  const handleChange = (index: number, value: string) => {
    const newAttendees = [...attendees];
    newAttendees[index] = value;
    onChange(newAttendees);
  };

  return (
    <div>
      <h2>Attendees</h2>
      {Array.from({ length: quantity }, (_, i) => (
        <div key={i}>
          <Label>Attendee {i + 1}</Label>
          <Input
            value={attendees[i] || ''}
            onChange={(e) => handleChange(i, e.target.value)}
          />
        </div>
      ))}
    </div>
  );
}
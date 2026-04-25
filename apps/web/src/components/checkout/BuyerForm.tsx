import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';

interface BuyerFormProps {
  data: { name: string; email: string; phone: string };
  onChange: (data: { name: string; email: string; phone: string }) => void;
}

export default function BuyerForm({ data, onChange }: BuyerFormProps) {
  return (
    <div>
      <h2>Buyer Information</h2>
      <div>
        <Label>Name</Label>
        <Input
          value={data.name}
          onChange={(e) => onChange({ ...data, name: e.target.value })}
        />
      </div>
      <div>
        <Label>Email</Label>
        <Input
          type="email"
          value={data.email}
          onChange={(e) => onChange({ ...data, email: e.target.value })}
        />
      </div>
      <div>
        <Label>Phone</Label>
        <Input
          value={data.phone}
          onChange={(e) => onChange({ ...data, phone: e.target.value })}
        />
      </div>
    </div>
  );
}
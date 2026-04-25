import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface PaymentMethodProps {
  selected: string;
  onChange: (method: string) => void;
}

export default function PaymentMethod({ selected, onChange }: PaymentMethodProps) {
  return (
    <div>
      <h2>Payment Method</h2>
      <Select value={selected} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue placeholder="Select payment method" />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="credit_card">Credit Card</SelectItem>
          <SelectItem value="paypal">PayPal</SelectItem>
          <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
        </SelectContent>
      </Select>
    </div>
  );
}
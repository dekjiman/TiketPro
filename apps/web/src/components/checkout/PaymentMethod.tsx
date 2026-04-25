'use client';

import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';

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
                {selected === method.id && (
                  <svg className="w-5 h-5 ml-auto" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="20 6 9 17 4 12"></polyline>
                  </svg>
                )}
              </div>
            </Button>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
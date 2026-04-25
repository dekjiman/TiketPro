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
import * as Midtrans from 'midtrans-client';
import { env } from '../config/env.js';
import crypto from 'node:crypto';

function getMidtransMode() {
  return Boolean(env.MIDTRANS_IS_PRODUCTION);
}

export function verifyNotificationSignature(body: any, expectedSignature?: string): boolean {
  const serverKey = env.MIDTRANS_SERVER_KEY?.trim();
  const orderId = String(body?.order_id || '');
  const statusCode = String(body?.status_code || '');
  const grossAmount = String(body?.gross_amount || '');
  const signature = String(expectedSignature || body?.signature_key || '');

  if (!serverKey || !orderId || !statusCode || !grossAmount || !signature) return false;

  const expected = crypto
    .createHash('sha512')
    .update(`${orderId}${statusCode}${grossAmount}${serverKey}`)
    .digest('hex');

  const expectedBuf = Buffer.from(expected, 'utf8');
  const actualBuf = Buffer.from(signature, 'utf8');
  if (expectedBuf.length !== actualBuf.length) return false;
  return crypto.timingSafeEqual(expectedBuf, actualBuf);
}

export async function createSnapToken(
  orderId: string,
  grossAmount: number,
  customer: {
    firstName: string;
    lastName?: string;
    email: string;
    phone?: string;
  },
  items: Array<{
    id: string;
    name: string;
    price: number;
    quantity: number;
  }> = [],
  discountAmount: number = 0,
  metadata?: {
    userId?: string;
    eventId?: string;
  }
): Promise<{ token: string; redirectUrl: string }> {
  console.log('[Midtrans] Creating Snap token:', {
    orderId,
    grossAmount,
    customer,
    itemCount: items.length,
    discountAmount,
  });

  if (!env.MIDTRANS_SERVER_KEY || !env.MIDTRANS_CLIENT_KEY) {
    throw new Error('Midtrans credentials not configured');
  }

  // Trim whitespace
  const serverKey = env.MIDTRANS_SERVER_KEY?.trim() || '';
  const clientKey = env.MIDTRANS_CLIENT_KEY?.trim() || '';

  const isProduction = getMidtransMode();

  try {
    const MidtransClient = (Midtrans as any).default || Midtrans;
    const snap = new (MidtransClient as any).Snap({
      serverKey,
      clientKey,
      isProduction,
    });

    const params: any = {
      transaction_details: {
        order_id: orderId,
        gross_amount: grossAmount,
      },
      customer_details: {
        first_name: customer.firstName,
        ...(customer.lastName && { last_name: customer.lastName }),
        email: customer.email,
        ...(customer.phone && { phone: customer.phone }),
      },
      enabled_payments: [
        'credit_card',
        'bca_va',
        'bni_va',
        'bri_va',
        'permata_va',
        'other_va',
        'gopay',
        'shopeepay',
        'mandiri_va',
        'alfamart',
        'indomaret',
      ],
    };

    if (discountAmount > 0) {
      params.transaction_details.discount_amount = discountAmount;
    }

    if (items.length > 0) {
      params.item_details = items.map((item) => ({
        id: item.id.substring(0, 50),
        name: item.name.substring(0, 50),
        price: item.price,
        quantity: item.quantity,
      }));
    }

    if (metadata?.userId) params.custom_field1 = metadata.userId.substring(0, 255);
    if (metadata?.eventId) params.custom_field2 = metadata.eventId.substring(0, 255);

    //console.log('[Midtrans] Request params:', JSON.stringify(params, null, 2));

    const snapToken = await snap.createTransactionToken(params);

    if (!snapToken || typeof snapToken !== 'string') {
      throw new Error(`Invalid token type: ${typeof snapToken}`);
    }

    //console.log('[Midtrans] Token created:', snapToken);

    const redirectUrl = isProduction
      ? `https://app.midtrans.com/snap/v2/vtweb/${snapToken}`
      : `https://app.sandbox.midtrans.com/snap/v2/vtweb/${snapToken}`;

    return {
      token: snapToken,
      redirectUrl,
    };
  } catch (error: any) {
    console.error('[Midtrans] Failed to create token');
    console.error('[Midtrans] Error message:', error.message);
    if (error.statusCode) console.error('[Midtrans] Status:', error.statusCode);
    if (error.body) console.error('[Midtrans] Body:', error.body);
    throw error;
  }
}

export async function getTransactionStatus(orderId: string): Promise<any> {
  if (!env.MIDTRANS_SERVER_KEY || !env.MIDTRANS_CLIENT_KEY) {
    throw new Error('Midtrans credentials not configured');
  }

  const serverKey = env.MIDTRANS_SERVER_KEY?.trim() || '';
  const clientKey = env.MIDTRANS_CLIENT_KEY?.trim() || '';
  const isProduction = getMidtransMode();

  try {
    const MidtransClient = (Midtrans as any).default || Midtrans;
    const core = new (MidtransClient as any).CoreApi({
      serverKey,
      clientKey,
      isProduction,
    });

    return await core.transaction.status(orderId);
  } catch (error: any) {
    console.error(`[Midtrans] Failed to get status for order ${orderId}:`, error.message);
    throw error;
  }
}

import { createSnapToken } from '../apps/api/src/lib/midtrans.js';

async function testMidtrans() {
  try {
    const result = createSnapToken(
      'test-order-123',
      10000,
      { name: 'Test User', email: 'test@example.com' }
    );
    console.log('Midtrans token created:', result);
  } catch (error) {
    console.error('Midtrans error:', error);
  }
}

testMidtrans();

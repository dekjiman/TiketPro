import { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { verifyNotificationSignature } from '../lib/midtrans.js';
import { processMidtransNotification } from '../services/payment-processor.js';

export async function paymentRoutes(fastify: FastifyInstance) {
  fastify.post('/midtrans/webhook', async (req: FastifyRequest, reply: FastifyReply) => {
    try {
      const notificationBody = req.body as any;
      const isValid = verifyNotificationSignature(notificationBody, notificationBody?.signature_key);
      if (!isValid) {
        return reply.code(401).send({ status: 'error', message: 'Invalid signature' });
      }

      const result = await processMidtransNotification(notificationBody);
      return { status: 'ok', orderId: result.actualOrderId, newStatus: result.newOrderStatus };
    } catch (error: any) {
      console.error('[PaymentsWebhook] Failed to process notification:', error?.message || error);
      return reply.code(200).send({ status: 'error', message: error?.message || 'unknown error' });
    }
  });
}

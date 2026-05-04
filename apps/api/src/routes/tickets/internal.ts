import { FastifyInstance } from 'fastify';

// Deprecated shim.
// The internal ticket generation flow now lives in eo-tickets.ts so there is a
// single source of truth for internal/manual ticket creation.
export async function internalTicketRoutes(fastify: FastifyInstance) {
  void fastify;
  throw new Error('internalTicketRoutes is deprecated. Use eoTicketRoutes instead.');
}

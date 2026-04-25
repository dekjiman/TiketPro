import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

type Role = 'SUPER_ADMIN' | 'EO_ADMIN' | 'EO_STAFF' | 'AFFILIATE' | 'RESELLER' | 'CUSTOMER' | 'GATE_STAFF';

const PERMISSIONS: Record<Role, string[]> = {
  SUPER_ADMIN: ['*'],
  EO_ADMIN: ['event.read', 'event.write', 'ticket.read', 'ticket.write', 'report.read', 'rfid.read', 'rfid.write', 'gami.read', 'gami.write'],
  EO_STAFF: ['ticket.read', 'ticket.write', 'scan.read', 'scan.write', 'report.read'],
  AFFILIATE: ['affiliate.read', 'affiliate.write'],
  RESELLER: ['reseller.read', 'reseller.write'],
  CUSTOMER: ['profile.read', 'profile.write', 'ticket.read', 'ticket.write'],
  GATE_STAFF: ['scan.read', 'scan.write'],
};

export function requireAuth(fastify: FastifyInstance) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    try {
      const decoded = fastify.jwt.verify(authHeader.replace('Bearer ', ''));
      (req as any).user = decoded;
    } catch (err) {
      return reply.code(401).send({ error: 'Invalid token' });
    }
  };
}

export function requireRole(...roles: Role[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { role: string };
    if (!user || !roles.includes(user.role as Role)) {
      return reply.code(403).send({ error: 'Insufficient permissions' });
    }
  };
}

export function requirePermission(permission: string) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { role: string; id: string };
    if (!user) {
      return reply.code(401).send({ error: 'Authentication required' });
    }

    const role = user.role as Role;
    const permissions = PERMISSIONS[role] || [];

    // Super admin has all permissions
    if (permissions.includes('*')) return;

    // Check exact permission or wildcard
    const hasPermission = permissions.some(p => 
      p === permission || p === permission.split('.')[0] + '.*'
    );

    if (!hasPermission) {
      return reply.code(403).send({ error: 'Permission denied' });
    }
  };
}
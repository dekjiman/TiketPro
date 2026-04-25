import { FastifyRequest, FastifyReply } from 'fastify';

export type UserRole = 'SUPER_ADMIN' | 'EO_ADMIN' | 'EO_STAFF' | 'AFFILIATE' | 'RESELLER' | 'CUSTOMER';

const ROLE_HIERARCHY: Record<UserRole, number> = {
  SUPER_ADMIN: 100,
  EO_ADMIN: 50,
  EO_STAFF: 40,
  AFFILIATE: 30,
  RESELLER: 30,
  CUSTOMER: 10,
};

export function authorize(...allowedRoles: UserRole[]) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; role: UserRole } | undefined;

    if (!user?.role) {
      return reply.code(403).send({ error: 'Forbidden: No role found' });
    }

    if (!allowedRoles.includes(user.role)) {
      return reply.code(403).send({ 
        error: 'Forbidden: You do not have permission to access this resource',
        code: 'INSUFFICIENT_PERMISSIONS'
      });
    }
  };
}

export function authorizeMinLevel(minRole: UserRole) {
  return async (req: FastifyRequest, reply: FastifyReply) => {
    const user = (req as any).user as { id: string; role: UserRole } | undefined;

    if (!user?.role) {
      return reply.code(403).send({ error: 'Forbidden: No role found' });
    }

    const userLevel = ROLE_HIERARCHY[user.role] || 0;
    const requiredLevel = ROLE_HIERARCHY[minRole] || 0;

    if (userLevel < requiredLevel) {
      return reply.code(403).send({ 
        error: 'Forbidden: Insufficient role level',
        code: 'INSUFFICIENT_ROLE_LEVEL'
      });
    }
  };
}

export function isAdmin(role: UserRole): boolean {
  return role === 'SUPER_ADMIN' || role === 'EO_ADMIN';
}

export function isSuperAdmin(role: UserRole): boolean {
  return role === 'SUPER_ADMIN';
}
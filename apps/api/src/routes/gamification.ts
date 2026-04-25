import { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { PrismaClient } from '@prisma/client';
import { authenticate } from './auth.js';
import { redis } from '../services/redis.js';

const prisma = new PrismaClient();

export async function gamiRoutes(fastify: FastifyInstance) {
  fastify.get('/profile', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    let profile = await prisma.userGameProfile.findUnique({ where: { userId: user.id } });
    
    if (!profile) {
      profile = await prisma.userGameProfile.create({
        data: { userId: user.id },
      });
    }

    const badges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });

    return { ...profile, badges };
  });

  fastify.get('/leaderboard/:eventId', async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as any;
    const key = `leaderboard:${eventId}`;
    
    const top = await redis.zrevrange(key, 0, 99, 'WITHSCORES');
    const result: any[] = [];
    
    for (let i = 0; i < top.length; i += 2) {
      const userId = top[i];
      const xp = parseInt(top[i + 1]);
      const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, name: true } });
      if (user) result.push({ ...user, xp, rank: i / 2 + 1 });
    }
    
    return result;
  });

  fastify.get('/missions/:eventId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as any;
    const user = req.user as any;

    const missions = await prisma.gameMission.findMany({
      where: { eventId, startAt: { lte: new Date() }, endAt: { gte: new Date() } },
    });

    const userMissions = await prisma.userMission.findMany({
      where: { userId: user.id, mission: { eventId } },
    });

    return missions.map(m => ({
      ...m,
      progress: userMissions.find(um => um.missionId === m.id)?.progress || 0,
      isCompleted: userMissions.find(um => um.missionId === m.id)?.isCompleted || false,
    }));
  });

  fastify.post('/checkin/:pointId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { pointId } = req.params as any;
    const user = req.user as any;

    const point = await prisma.checkInPoint.findUnique({ where: { id: pointId } });
    if (!point) return reply.code(404).send({ error: 'Check-in point not found' });

    let profile = await prisma.userGameProfile.findUnique({ where: { userId: user.id } });
    if (!profile) {
      profile = await prisma.userGameProfile.create({ data: { userId: user.id } });
    }

    await prisma.xpLog.create({
      data: { userId: user.id, eventId: point.eventId, action: 'CHECK_IN_POINT', xpEarned: point.xpReward, description: `Check-in at ${point.name}` },
    });

    await prisma.userGameProfile.update({
      where: { id: profile.id },
      data: { totalXp: { increment: point.xpReward } },
    });

    const key = `leaderboard:${point.eventId}`;
    await redis.zincrby(key, point.xpReward, user.id);

    return { xpEarned: point.xpReward, newTotal: profile.totalXp + point.xpReward };
  });

  fastify.post('/claim-mission', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { missionId } = req.body as any;
    const user = req.user as any;

    const mission = await prisma.gameMission.findUnique({ where: { id: missionId } });
    if (!mission) return reply.code(404).send({ error: 'Mission not found' });

    let userMission = await prisma.userMission.findFirst({
      where: { userId: user.id, missionId },
    });

    if (!userMission) {
      userMission = await prisma.userMission.create({
        data: { userId: user.id, missionId, progress: 1, isCompleted: true, completedAt: new Date() },
      });
    } else {
      await prisma.userMission.update({
        where: { id: userMission.id },
        data: { progress: { increment: 1 }, isCompleted: true, completedAt: new Date() },
      });
    }

    let profile = await prisma.userGameProfile.findUnique({ where: { userId: user.id } });
    if (profile) {
      await prisma.userGameProfile.update({
        where: { id: profile.id },
        data: { totalXp: { increment: mission.xpReward } },
      });
      await redis.zincrby(`leaderboard:${mission.eventId}`, mission.xpReward, user.id);
    }

    return { xpEarned: mission.xpReward };
  });

  fastify.get('/badges', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const user = req.user as any;
    const userBadges = await prisma.userBadge.findMany({
      where: { userId: user.id },
      include: { badge: true },
    });
    return userBadges;
  });

  fastify.post('/missions', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId, title, description, xpReward, missionType, targetValue, startAt, endAt } = req.body as any;
    
    const mission = await prisma.gameMission.create({
      data: { eventId, title, description, xpReward, missionType, targetValue, startAt: new Date(startAt), endAt: new Date(endAt) },
    });
    return mission;
  });

  fastify.get('/stats/:eventId', { preHandler: [authenticate] }, async (req: FastifyRequest, reply: FastifyReply) => {
    const { eventId } = req.params as any;
    
    const totalXp = await prisma.xpLog.aggregate({ where: { eventId }, _sum: { xpEarned: true } });
    const missionsCompleted = await prisma.userMission.count({ where: { mission: { eventId }, isCompleted: true } });
    const uniqueParticipants = await prisma.xpLog.groupBy({ by: ['userId'], where: { eventId } });

    return { totalXp: totalXp._sum.xpEarned || 0, missionsCompleted, uniqueParticipants: uniqueParticipants.length };
  });
}
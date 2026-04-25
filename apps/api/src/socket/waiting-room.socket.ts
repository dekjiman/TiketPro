import { Server } from 'socket.io';
import {
  enqueueUser,
  getQueuePosition,
  processQueue,
  calculateEstimatedWait,
  isWaitingRoomActive,
} from '../lib/waiting-room.js';
import { env } from '../config/env.js';

interface WaitingRoomSocket {
  io: Server;
  userSockets: Map<string, string>;
  intervals: Map<string, NodeJS.Timeout>;
}

const waitingRoomState: WaitingRoomSocket = {
  io: null!,
  userSockets: new Map(),
  intervals: new Map(),
};

export function initWaitingRoomSocket(io: Server) {
  waitingRoomState.io = io;

  io.on('connection', (socket) => {
    const userId = socket.data.userId as string | undefined;

    if (!userId) {
      socket.disconnect();
      return;
    }

    waitingRoomState.userSockets.set(userId, socket.id);

    socket.on('queue:join', async (data: { categoryId: string }) => {
      const { categoryId } = data;

      const isActive = await isWaitingRoomActive(categoryId);
      if (!isActive) {
        socket.emit('queue:error', { message: 'Waiting room not active' });
        return;
      }

      const position = await enqueueUser(categoryId, userId);
      if (position === -1) {
        const existingPosition = await getQueuePosition(categoryId, userId);
        socket.emit('queue:position', {
          position: existingPosition,
          estimatedWaitSeconds: calculateEstimatedWait(existingPosition || 0),
        });
        return;
      }

      socket.emit('queue:position', {
        position,
        estimatedWaitSeconds: calculateEstimatedWait(position),
      });

      socket.join(`waiting:${categoryId}`);
    });

    socket.on('queue:leave', async (data: { categoryId: string }) => {
      const { categoryId } = data;
      socket.leave(`waiting:${categoryId}`);
    });

    socket.on('disconnect', async () => {
      waitingRoomState.userSockets.delete(userId);
    });
  });
}

export async function startQueueProcessor(categoryId: string) {
  if (waitingRoomState.intervals.has(categoryId)) {
    return;
  }

  const tickInterval = setInterval(
    async () => {
      const tokens = await processQueue(categoryId);

      if (tokens.length === 0) {
        return;
      }

      const io = waitingRoomState.io;
      for (const token of tokens) {
        io.to(`waiting:${categoryId}`).emit('queue:ready', { checkoutToken: token });
      }
    },
    env.WAITING_ROOM_TICK_MS
  );

  waitingRoomState.intervals.set(categoryId, tickInterval);
}

export function stopQueueProcessor(categoryId: string) {
  const interval = waitingRoomState.intervals.get(categoryId);
  if (interval) {
    clearInterval(interval);
    waitingRoomState.intervals.delete(categoryId);
  }
}

export function getWaitingRoomSocket() {
  return waitingRoomState.io;
}
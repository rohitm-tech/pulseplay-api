import { Server, Socket } from 'socket.io';
import { Types } from 'mongoose';
import { verifyAccessToken, AccessPayload } from '../utils/jwt';
import { parseCommentaryLine } from '../services/commentaryProcessor.service';
import { ChatMessage } from '../modules/chat/chat.model';
import { setPollsIo } from '../modules/polls/poll.service';

function optionalSocketAuth(socket: Socket, next: (err?: Error) => void) {
  try {
    const token = socket.handshake.auth?.token as string | undefined;
    if (!token) {
      socket.data.user = undefined;
      next();
      return;
    }
    socket.data.user = verifyAccessToken(token) as AccessPayload;
    next();
  } catch {
    socket.data.user = undefined;
    next();
  }
}

function requireSocketUser(socket: Socket): AccessPayload {
  const u = socket.data.user as AccessPayload | undefined;
  if (!u) throw new Error('Unauthorized');
  return u;
}

export function registerSockets(io: Server): void {
  setPollsIo(io);

  const matchesNs = io.of('/matches');
  matchesNs.use(optionalSocketAuth);
  matchesNs.on('connection', (socket) => {
    socket.on('join_match', ({ matchId }: { matchId: string }) => {
      if (!matchId) return;
      socket.join(`match:${matchId}`);
    });
    socket.on('leave_match', ({ matchId }: { matchId: string }) => {
      if (!matchId) return;
      socket.leave(`match:${matchId}`);
    });
    socket.on('join_team', ({ team }: { team: string }) => {
      if (!team) return;
      socket.join(`team:${team}`);
    });
    socket.on('fan_reaction', ({ matchId, emoji }: { matchId: string; emoji: string }) => {
      try {
        requireSocketUser(socket);
      } catch {
        return;
      }
      if (!matchId || !emoji) return;
      matchesNs.to(`match:${matchId}`).emit('fan_reaction', {
        matchId,
        emoji,
        userId: (socket.data.user as AccessPayload).sub,
        ts: Date.now(),
      });
    });
  });

  const chatNs = io.of('/chat');
  chatNs.use(optionalSocketAuth);
  chatNs.on('connection', (socket) => {
    socket.on('join_room', ({ matchId, room }: { matchId: string; room: string }) => {
      if (!matchId) return;
      const r = room || `match:${matchId}`;
      socket.join(r);
    });
    socket.on(
      'send_message',
      async ({ matchId, room, text, userName }: { matchId: string; room?: string; text: string; userName?: string }) => {
        let user;
        try {
          user = requireSocketUser(socket);
        } catch {
          socket.emit('error', { message: 'Login required to chat' });
          return;
        }
        const r = room || `match:${matchId}`;
        const msg = await ChatMessage.create({
          matchId,
          room: r,
          userId: new Types.ObjectId(user.sub),
          userName: userName || 'Fan',
          text: String(text).slice(0, 2000),
        });
        chatNs.to(r).emit('chat_message', {
          id: msg._id.toString(),
          matchId,
          room: r,
          userId: user.sub,
          userName: msg.userName,
          text: msg.text,
          createdAt: msg.get('createdAt'),
        });
      }
    );
    socket.on('typing', ({ room, userName }: { room: string; userName?: string }) => {
      if (!room) return;
      socket.to(room).emit('typing', { userName: userName || 'Someone' });
    });
    socket.on('react_message', async ({ messageId, emoji }: { messageId: string; emoji: string }) => {
      let user;
      try {
        user = requireSocketUser(socket);
      } catch {
        return;
      }
      const msg = await ChatMessage.findById(messageId);
      if (!msg) return;
      const uid = new Types.ObjectId(user.sub);
      const existing = msg.reactions.find((x) => x.emoji === emoji);
      if (existing) {
        const idx = existing.userIds.findIndex((id) => id.equals(uid));
        if (idx >= 0) existing.userIds.splice(idx, 1);
        else existing.userIds.push(uid);
      } else {
        msg.reactions.push({ emoji, userIds: [uid] });
      }
      await msg.save();
      chatNs.to(msg.room).emit('message_reaction', { messageId, emoji, reactions: msg.reactions });
    });
  });

  const pollsNs = io.of('/polls');
  pollsNs.use(optionalSocketAuth);
  pollsNs.on('connection', (socket) => {
    socket.on('join_match_polls', ({ matchId }: { matchId: string }) => {
      if (!matchId) return;
      socket.join(`match:${matchId}`);
    });
  });
}

export function emitMatchEvent(io: Server, matchId: string, event: unknown) {
  io.of('/matches').to(`match:${matchId}`).emit('match_event', event);
}

export function emitNewCommentary(io: Server, matchId: string, ball: { text: string; over: string }) {
  const structured = parseCommentaryLine(ball.text);
  io.of('/matches').to(`match:${matchId}`).emit('new_commentary', {
    matchId,
    ...ball,
    structured,
  });
}

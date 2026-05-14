import { z } from 'zod';
import { Types } from 'mongoose';
import { Poll } from './poll.model';
import { User } from '../users/user.model';
import { Leaderboard } from '../leaderboard/leaderboard.model';
import { ApiError } from '../../utils/apiError';
import { createNotification } from '../notifications/notification.service';
import type { Server } from 'socket.io';

let ioRef: Server | null = null;

export function setPollsIo(io: Server) {
  ioRef = io;
}

export async function createPoll(input: {
  question: string;
  options: string[];
  matchId: string;
  expiresAt: string;
  correctAnswer?: string;
  createdBy?: Types.ObjectId;
}) {
  const schema = z.object({
    question: z.string().min(4),
    options: z.array(z.string()).min(2).max(6),
    matchId: z.string(),
    expiresAt: z.string(),
    correctAnswer: z.string().optional(),
  });
  const data = schema.parse(input);
  const poll = await Poll.create({
    question: data.question,
    options: data.options,
    matchId: data.matchId,
    expiresAt: new Date(data.expiresAt),
    correctAnswer: data.correctAnswer,
    createdBy: input.createdBy,
  });
  const pollCreatedPayload = {
    pollId: poll._id.toString(),
    question: poll.question,
    options: poll.options,
    matchId: poll.matchId,
    expiresAt: poll.expiresAt,
  };
  ioRef?.of('/polls').to(`match:${data.matchId}`).emit('poll_created', pollCreatedPayload);
  /** Same room on /matches so every fan in the match room sees new polls without a separate polls socket. */
  ioRef?.of('/matches').to(`match:${data.matchId}`).emit('poll_created', pollCreatedPayload);
  return poll;
}

export async function votePoll(pollId: string, userId: string, option: string) {
  const poll = await Poll.findById(pollId);
  if (!poll || poll.status !== 'open') throw new ApiError(400, 'Poll not available');
  if (poll.expiresAt.getTime() < Date.now()) {
    poll.status = 'closed';
    await poll.save();
    throw new ApiError(400, 'Poll closed');
  }
  if (!poll.options.includes(option)) throw new ApiError(400, 'Invalid option');
  const uid = new Types.ObjectId(userId);
  poll.votes = poll.votes.filter((v) => v.userId.toString() !== userId);
  poll.votes.push({ userId: uid, option });
  await poll.save();
  return poll;
}

export async function closePollAndScore(pollId: string) {
  const poll = await Poll.findById(pollId);
  if (!poll) throw new ApiError(404, 'Poll not found');
  if (!poll.correctAnswer) throw new ApiError(400, 'No correct answer set');
  poll.status = 'closed';
  await poll.save();
  const winners = poll.votes.filter((v) => v.option === poll.correctAnswer);
  for (const w of winners) {
    await User.findByIdAndUpdate(w.userId, { $inc: { xpPoints: 25, correctPredictions: 1, streak: 1 } });
    await Leaderboard.findOneAndUpdate(
      { userId: w.userId },
      { $inc: { xp: 25, correctPredictions: 1, streak: 1 } },
      { upsert: true }
    );
    try {
      await createNotification(w.userId.toString(), {
        type: 'poll',
        title: 'Poll win',
        body: `You nailed it — +25 XP on: "${poll.question.slice(0, 80)}${poll.question.length > 80 ? '…' : ''}"`,
        meta: { pollId: poll._id.toString(), matchId: poll.matchId },
      });
    } catch (e) {
      console.warn('[poll] notification', e);
    }
  }
  const losers = poll.votes.filter((v) => v.option !== poll.correctAnswer);
  for (const l of losers) {
    await User.findByIdAndUpdate(l.userId, { $set: { streak: 0 } });
    await Leaderboard.findOneAndUpdate({ userId: l.userId }, { $set: { streak: 0 } }, { upsert: true });
  }
  const pollResultPayload = {
    pollId: poll._id.toString(),
    correctAnswer: poll.correctAnswer,
    winners: winners.length,
  };
  ioRef?.of('/polls').to(`match:${poll.matchId}`).emit('poll_result', pollResultPayload);
  ioRef?.of('/matches').to(`match:${poll.matchId}`).emit('poll_result', pollResultPayload);
  ioRef?.of('/matches').to(`match:${poll.matchId}`).emit('leaderboard_update', { reason: 'poll_result' });
  return poll;
}

export async function listPollsForMatch(matchId: string) {
  return Poll.find({ matchId }).sort({ createdAt: -1 }).limit(50).lean();
}

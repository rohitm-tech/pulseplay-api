import { Response, Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { ChatMessage } from './chat.model';
import { ChatReport } from './chatReport.model';
import { Types } from 'mongoose';
import { z } from 'zod';

const router = Router();

const reportSchema = z.object({
  messageId: z.string(),
  matchId: z.string(),
  room: z.string(),
  reason: z.string().max(500).optional(),
});

router.post(
  '/report',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = reportSchema.parse(req.body);
    const msg = await ChatMessage.findById(body.messageId);
    if (!msg) {
      res.status(404).json({ success: false, message: 'Message not found' });
      return;
    }
    await ChatReport.create({
      reporterId: new Types.ObjectId(req.auth!.sub),
      messageId: new Types.ObjectId(body.messageId),
      matchId: body.matchId,
      room: body.room,
      reason: body.reason ?? '',
    });
    res.json({ success: true, message: 'Report received' });
  })
);

router.get(
  '/:matchId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const { matchId } = req.params;
    const room = (req.query.room as string) || `match:${matchId}`;
    const msgs = await ChatMessage.find({ matchId, room })
      .sort({ createdAt: -1 })
      .limit(80)
      .lean();
    res.json({ success: true, data: msgs.reverse() });
  })
);

router.delete(
  '/message/:id',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    if (req.auth?.role !== 'admin') {
      res.status(403).json({ success: false, message: 'Forbidden' });
      return;
    }
    await ChatMessage.deleteOne({ _id: new Types.ObjectId(req.params.id) });
    res.json({ success: true });
  })
);

export default router;

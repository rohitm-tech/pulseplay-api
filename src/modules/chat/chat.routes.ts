import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { ChatMessage } from './chat.model';
import { Types } from 'mongoose';

const router = Router();

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

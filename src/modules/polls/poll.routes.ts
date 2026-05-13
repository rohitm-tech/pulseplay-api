import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest, requireAdmin } from '../../middleware/auth.middleware';
import { closePollAndScore, createPoll, listPollsForMatch, votePoll } from './poll.service';
import { Types } from 'mongoose';

const router = Router();

router.get(
  '/match/:matchId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const polls = await listPollsForMatch(req.params.matchId);
    res.json({ success: true, data: polls });
  })
);

router.post(
  '/vote',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const { pollId, option } = req.body as { pollId?: string; option?: string };
    if (!pollId || !option) {
      res.status(400).json({ success: false, message: 'pollId and option required' });
      return;
    }
    const poll = await votePoll(pollId, req.auth!.sub, option);
    res.json({ success: true, data: poll });
  })
);

router.post(
  '/',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const poll = await createPoll({
      ...req.body,
      createdBy: new Types.ObjectId(req.auth!.sub),
    });
    res.status(201).json({ success: true, data: poll });
  })
);

router.post(
  '/:id/close',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const poll = await closePollAndScore(req.params.id);
    res.json({ success: true, data: poll });
  })
);

export default router;

import { Request, Response, Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest, requireAdmin } from '../../middleware/auth.middleware';
import { closePollAndScore, createPoll, listPollsForMatch, votePoll } from './poll.service';
import { generateAndCreatePollFromCommentary } from '../../services/pollGeneration.service';

const router = Router();

const generatePollBody = z.object({
  matchId: z.string().min(1).max(120),
  expiresAt: z.string().optional(),
  hoursValid: z.number().min(1).max(168).optional(),
  hydrateIfEmpty: z.boolean().optional(),
});
router.post(
  '/generate-from-commentary',
  authMiddleware,
  requireAdmin,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = generatePollBody.parse(req.body);
    const hours = body.hoursValid ?? 6;
    const expires =
      body.expiresAt && body.expiresAt.trim().length > 0 ? new Date(body.expiresAt) : new Date(Date.now() + hours * 60 * 60 * 1000);
    if (Number.isNaN(expires.getTime())) {
      res.status(400).json({ success: false, message: 'Invalid expiresAt' });
      return;
    }
    const poll = await generateAndCreatePollFromCommentary({
      matchId: body.matchId,
      expiresAt: expires,
      createdBy: new Types.ObjectId(req.auth!.sub),
      hydrateIfEmpty: body.hydrateIfEmpty === true,
    });
    res.status(201).json({ success: true, data: poll });
  })
);

router.get(
  '/match/:matchId',
  asyncHandler(async (req: Request, res: Response) => {
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

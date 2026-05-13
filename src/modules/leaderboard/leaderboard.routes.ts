import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { Leaderboard } from './leaderboard.model';
import { User } from '../users/user.model';

const router = Router();

router.get(
  '/',
  authMiddleware,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const rows = await Leaderboard.find()
      .sort({ xp: -1 })
      .limit(100)
      .populate('userId', 'name email avatar xpPoints')
      .lean();
    res.json({ success: true, data: rows });
  })
);

router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.auth!.sub).lean();
    const board = await Leaderboard.findOne({ userId: req.auth!.sub }).lean();
    res.json({
      success: true,
      data: {
        user,
        leaderboard: board,
      },
    });
  })
);

export default router;

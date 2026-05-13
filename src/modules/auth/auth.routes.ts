import { Response } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { AuthRequest, authMiddleware } from '../../middleware/auth.middleware';
import { registerUser, loginUser, refreshTokens } from './auth.service';
import { User, toSafeUser } from '../users/user.model';
import { authLimiter } from '../../middleware/rateLimit.middleware';

import { Router } from 'express';

const router = Router();

router.post(
  '/register',
  authLimiter,
  asyncHandler(async (req, res: Response) => {
    const result = await registerUser(req.body);
    res.status(201).json({ success: true, data: result });
  })
);

router.post(
  '/login',
  authLimiter,
  asyncHandler(async (req, res: Response) => {
    const result = await loginUser(req.body);
    res.json({ success: true, data: result });
  })
);

router.post(
  '/refresh',
  authLimiter,
  asyncHandler(async (req, res: Response) => {
    const refreshToken = req.body?.refreshToken as string | undefined;
    if (!refreshToken) {
      res.status(400).json({ success: false, message: 'refreshToken required' });
      return;
    }
    const tokens = await refreshTokens(refreshToken);
    res.json({ success: true, data: tokens });
  })
);

router.get(
  '/me',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.auth?.sub);
    if (!user) {
      res.status(404).json({ success: false, message: 'User not found' });
      return;
    }
    res.json({ success: true, data: toSafeUser(user) });
  })
);

export default router;

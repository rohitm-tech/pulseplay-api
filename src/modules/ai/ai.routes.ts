import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { explainWicket, getMatchInsights } from '../../services/aiInsights.service';

const router = Router();

router.get(
  '/match/:matchId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const insights = await getMatchInsights(req.params.matchId);
    res.json({ success: true, data: insights });
  })
);

router.post(
  '/explain-wicket',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const text = String(req.body?.text ?? '');
    const explanation = await explainWicket(text);
    res.json({ success: true, data: { explanation } });
  })
);

export default router;

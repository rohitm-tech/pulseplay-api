import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { fetchCommentary, fetchCurrentMatches, fetchMatchById } from '../../services/cricapi.service';
import { parseCommentaryLine } from '../../services/commentaryProcessor.service';

const router = Router();

router.get(
  '/live',
  asyncHandler(async (_req, res: Response) => {
    const matches = await fetchCurrentMatches();
    res.json({ success: true, data: matches });
  })
);

router.get(
  '/:id/commentary',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const balls = await fetchCommentary(req.params.id);
    const enriched = balls.map((b) => ({
      ...b,
      event: parseCommentaryLine(b.text),
    }));
    res.json({ success: true, data: enriched });
  })
);

router.get(
  '/:id',
  asyncHandler(async (req, res: Response) => {
    const match = await fetchMatchById(req.params.id);
    if (!match) {
      res.status(404).json({ success: false, message: 'Match not found' });
      return;
    }
    res.json({ success: true, data: match });
  })
);

export default router;

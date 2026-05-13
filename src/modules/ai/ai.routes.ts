import { Response, Router } from 'express';
import { z } from 'zod';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { explainWicket, getMatchAiAnalysis } from '../../services/aiInsights.service';
import { comparePlayers, matchPreviewBlurb, sentimentHeuristic, whatHappened } from '../../services/aiExtras.service';
import { fetchMatchById } from '../../services/cricapi.service';

const router = Router();

router.get(
  '/match/:matchId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const analysis = await getMatchAiAnalysis(req.params.matchId);
    res.json({ success: true, data: analysis });
  })
);

router.get(
  '/match/:matchId/preview',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const m = await fetchMatchById(req.params.matchId);
    const preview = await matchPreviewBlurb(JSON.stringify(m ?? { id: req.params.matchId }));
    res.json({ success: true, data: preview });
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

const compareSchema = z.object({
  playerA: z.string().min(1).max(120),
  playerB: z.string().min(1).max(120),
  context: z.string().max(8000).optional(),
});

router.post(
  '/compare-players',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const body = compareSchema.parse(req.body);
    const data = await comparePlayers(body.playerA, body.playerB, body.context);
    res.json({ success: true, data });
  })
);

router.post(
  '/what-happened',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const text = String(req.body?.text ?? '');
    const data = await whatHappened(text);
    res.json({ success: true, data });
  })
);

router.post(
  '/sentiment',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const text = String(req.body?.text ?? '');
    res.json({ success: true, data: sentimentHeuristic(text) });
  })
);

export default router;

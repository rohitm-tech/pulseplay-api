import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { fetchCommentary, fetchCurrentMatches, fetchMatchById } from '../../services/cricapi.service';
import { parseCommentaryLine } from '../../services/commentaryProcessor.service';
import { buildMatchAnalytics } from '../../services/matchAnalytics.service';
import { User } from '../users/user.model';

const router = Router();

router.get(
  '/live',
  asyncHandler(async (_req, res: Response) => {
    const matches = await fetchCurrentMatches();
    res.json({ success: true, data: matches });
  })
);

router.get(
  '/feed/for-you',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const matches = await fetchCurrentMatches();
    const u = await User.findById(req.auth!.sub).lean();
    const team = (u?.favoriteTeam ?? '').toLowerCase().trim();
    if (!team) {
      res.json({ success: true, data: matches });
      return;
    }
    const scored = matches.map((m) => {
      const blob = `${m.name} ${(m.teams ?? []).join(' ')} ${m.status}`.toLowerCase();
      const score = blob.includes(team) ? 2 : 0;
      return { m, score };
    });
    scored.sort((a, b) => b.score - a.score);
    res.json({ success: true, data: scored.map((x) => x.m) });
  })
);

router.get(
  '/:id/analytics',
  asyncHandler(async (req, res: Response) => {
    const [match, rawBalls] = await Promise.all([fetchMatchById(req.params.id), fetchCommentary(req.params.id)]);
    const analytics = buildMatchAnalytics(match, rawBalls);
    res.json({ success: true, data: analytics });
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

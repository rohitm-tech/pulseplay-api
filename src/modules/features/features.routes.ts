import { Response, Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { randomTrivia, verifyTriviaAnswer } from '../../services/trivia.service';
import { z } from 'zod';

const router = Router();

router.get(
  '/trivia',
  authMiddleware,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const q = randomTrivia();
    res.json({
      success: true,
      data: { id: q.id, question: q.question, options: q.options, category: q.category },
    });
  })
);

const verifySchema = z.object({
  id: z.string(),
  choice: z.string(),
});

router.post(
  '/trivia/verify',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const body = verifySchema.parse(req.body);
    const result = verifyTriviaAnswer(body.id, body.choice);
    res.json({ success: true, data: result });
  })
);

export default router;

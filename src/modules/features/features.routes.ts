import { Response, Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { randomTrivia, verifyQuizPackAnswer, verifyTriviaAnswer } from '../../services/trivia.service';
import { buildFanDesk, buildQuizHint, generateAiQuizPack } from '../../services/fanHub.service';
import { z } from 'zod';

const router = Router();

router.get(
  '/fan-desk',
  authMiddleware,
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const data = await buildFanDesk();
    res.json({ success: true, data });
  })
);

const packVerifySchema = z.object({
  packId: z.string().uuid(),
  questionId: z.string().min(1),
  choice: z.string(),
});

router.post(
  '/fan-desk/quiz/verify',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = packVerifySchema.parse(req.body);
    const result = verifyQuizPackAnswer(body.packId, body.questionId, body.choice);
    res.json({ success: true, data: result });
  })
);

const packHintSchema = z.object({
  packId: z.string().uuid(),
  questionId: z.string().min(1),
});

router.post(
  '/fan-desk/quiz/hint',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = packHintSchema.parse(req.body);
    const data = await buildQuizHint(body.packId, body.questionId);
    res.json({ success: true, data });
  })
);

const generatePackSchema = z.object({
  interests: z.string().max(500).optional(),
});

router.post(
  '/fan-desk/quiz/generate',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = generatePackSchema.parse(req.body);
    const data = await generateAiQuizPack(body.interests);
    res.json({ success: true, data });
  })
);

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

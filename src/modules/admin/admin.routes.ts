import { Response } from 'express';
import { Router } from 'express';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest, requireAdmin } from '../../middleware/auth.middleware';
import { Poll } from '../polls/poll.model';
import { ChatMessage } from '../chat/chat.model';
import { fetchCurrentMatches } from '../../services/cricapi.service';

const router = Router();

router.use(authMiddleware, requireAdmin);

router.get(
  '/analytics',
  asyncHandler(async (_req: AuthRequest, res: Response) => {
    const [polls, messages, matches] = await Promise.all([
      Poll.countDocuments(),
      ChatMessage.countDocuments(),
      fetchCurrentMatches(),
    ]);
    res.json({
      success: true,
      data: {
        pollsTotal: polls,
        chatMessagesTotal: messages,
        liveMatches: matches.length,
      },
    });
  })
);

export default router;

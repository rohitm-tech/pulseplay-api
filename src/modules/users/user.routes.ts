import { Response, Router } from 'express';
import { z } from 'zod';
import { Types } from 'mongoose';
import { asyncHandler } from '../../utils/asyncHandler';
import { authMiddleware, AuthRequest } from '../../middleware/auth.middleware';
import { User, toSafeUser } from '../users/user.model';
import { ApiError } from '../../utils/apiError';
import { listNotifications, markNotificationRead, unreadCount } from '../notifications/notification.service';
import { listAchievementDefinitions, unlockedAchievementIds } from '../../services/achievements.service';

const router = Router();

const patchMeSchema = z.object({
  name: z.string().min(2).max(120).optional(),
  favoriteTeam: z.string().max(64).optional().nullable(),
  favoritePlayers: z.array(z.string().max(64)).max(8).optional(),
  notificationPrefs: z
    .object({
      boundaries: z.boolean().optional(),
      wickets: z.boolean().optional(),
      milestones: z.boolean().optional(),
      polls: z.boolean().optional(),
    })
    .optional(),
});

router.patch(
  '/me',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const body = patchMeSchema.parse(req.body);
    const user = await User.findById(req.auth!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    if (body.name) user.name = body.name;
    if (body.favoriteTeam !== undefined) user.favoriteTeam = body.favoriteTeam || undefined;
    if (body.favoritePlayers) user.favoritePlayers = body.favoritePlayers;
    if (body.notificationPrefs) {
      user.notificationPrefs = {
        ...user.notificationPrefs,
        ...body.notificationPrefs,
      } as typeof user.notificationPrefs;
    }
    await user.save();
    res.json({ success: true, data: toSafeUser(user) });
  })
);

router.get(
  '/me/notifications',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const list = await listNotifications(req.auth!.sub);
    const unread = await unreadCount(req.auth!.sub);
    res.json({ success: true, data: { items: list, unread } });
  })
);

router.patch(
  '/me/notifications/:id/read',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const n = await markNotificationRead(req.auth!.sub, req.params.id);
    if (!n) throw new ApiError(404, 'Notification not found');
    res.json({ success: true });
  })
);

router.get(
  '/search',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    void req;
    const q = String(req.query.q ?? '')
      .trim()
      .slice(0, 64);
    if (q.length < 2) {
      res.json({ success: true, data: [] });
      return;
    }
    const esc = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const users = await User.find({ name: new RegExp(esc, 'i') })
      .select('name avatar favoriteTeam xpPoints')
      .limit(12)
      .lean();
    res.json({
      success: true,
      data: users.map((u) => ({
        id: u._id.toString(),
        name: u.name,
        avatar: u.avatar,
        favoriteTeam: u.favoriteTeam,
        xpPoints: u.xpPoints,
      })),
    });
  })
);

router.post(
  '/follow/:targetId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const self = req.auth!.sub;
    const target = req.params.targetId;
    if (self === target) throw new ApiError(400, 'Cannot follow yourself');
    const u = await User.findById(self);
    if (!u) throw new ApiError(404, 'User not found');
    const tid = new Types.ObjectId(target);
    const exists = await User.findById(tid);
    if (!exists) throw new ApiError(404, 'Target user not found');
    const set = new Set((u.followingIds ?? []).map((id) => id.toString()));
    if (set.has(target)) {
      res.json({ success: true, data: toSafeUser(u) });
      return;
    }
    if (set.size >= 500) throw new ApiError(400, 'Following limit reached');
    u.followingIds = [...(u.followingIds ?? []), tid];
    await u.save();
    res.json({ success: true, data: toSafeUser(u) });
  })
);

router.delete(
  '/follow/:targetId',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const self = req.auth!.sub;
    const target = req.params.targetId;
    const u = await User.findById(self);
    if (!u) throw new ApiError(404, 'User not found');
    u.followingIds = (u.followingIds ?? []).filter((id) => id.toString() !== target);
    await u.save();
    res.json({ success: true, data: toSafeUser(u) });
  })
);

router.get(
  '/me/achievements',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.auth!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    const safe = toSafeUser(user);
    const unlocked = unlockedAchievementIds(safe);
    res.json({
      success: true,
      data: {
        definitions: listAchievementDefinitions(),
        unlocked,
      },
    });
  })
);

router.post(
  '/me/achievements/claim',
  authMiddleware,
  asyncHandler(async (req: AuthRequest, res: Response) => {
    const user = await User.findById(req.auth!.sub);
    if (!user) throw new ApiError(404, 'User not found');
    const safe = toSafeUser(user);
    const unlocked = unlockedAchievementIds(safe);
    const merged = Array.from(new Set([...(user.badges ?? []), ...unlocked]));
    user.badges = merged;
    await user.save();
    res.json({ success: true, data: toSafeUser(user) });
  })
);

export default router;

import { Types } from 'mongoose';
import { Notification, NotificationType } from './notification.model';

export async function createNotification(
  userId: string,
  input: { title: string; body: string; type?: NotificationType; meta?: Record<string, unknown> }
): Promise<void> {
  await Notification.create({
    userId: new Types.ObjectId(userId),
    title: input.title,
    body: input.body,
    type: input.type ?? 'system',
    read: false,
    meta: input.meta,
  });
}

export async function listNotifications(userId: string, limit = 40) {
  return Notification.find({ userId: new Types.ObjectId(userId) })
    .sort({ createdAt: -1 })
    .limit(limit)
    .lean();
}

export async function markNotificationRead(userId: string, notificationId: string) {
  const n = await Notification.findOneAndUpdate(
    { _id: new Types.ObjectId(notificationId), userId: new Types.ObjectId(userId) },
    { $set: { read: true } },
    { new: true }
  );
  return n;
}

export async function unreadCount(userId: string) {
  return Notification.countDocuments({ userId: new Types.ObjectId(userId), read: false });
}

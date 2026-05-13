import mongoose, { Schema, Document, Types } from 'mongoose';

export type NotificationType = 'poll' | 'moment' | 'social' | 'system';

export interface INotification extends Document {
  userId: Types.ObjectId;
  title: string;
  body: string;
  type: NotificationType;
  read: boolean;
  meta?: Record<string, unknown>;
}

const notificationSchema = new Schema<INotification>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    title: { type: String, required: true, maxlength: 200 },
    body: { type: String, required: true, maxlength: 2000 },
    type: { type: String, enum: ['poll', 'moment', 'social', 'system'], default: 'system' },
    read: { type: Boolean, default: false, index: true },
    meta: { type: Schema.Types.Mixed },
  },
  { timestamps: true }
);

export const Notification = mongoose.model<INotification>('Notification', notificationSchema);

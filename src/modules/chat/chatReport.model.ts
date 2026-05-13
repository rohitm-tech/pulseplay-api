import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IChatReport extends Document {
  reporterId: Types.ObjectId;
  messageId: Types.ObjectId;
  matchId: string;
  room: string;
  reason: string;
}

const chatReportSchema = new Schema<IChatReport>(
  {
    reporterId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    messageId: { type: Schema.Types.ObjectId, ref: 'ChatMessage', required: true, index: true },
    matchId: { type: String, required: true },
    room: { type: String, required: true },
    reason: { type: String, maxlength: 500, default: '' },
  },
  { timestamps: true }
);

export const ChatReport = mongoose.model<IChatReport>('ChatReport', chatReportSchema);

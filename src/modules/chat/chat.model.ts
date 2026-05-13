import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IChatMessage extends Document {
  matchId: string;
  room: string;
  userId: Types.ObjectId;
  userName: string;
  text: string;
  reactions: { emoji: string; userIds: Types.ObjectId[] }[];
}

const chatMessageSchema = new Schema<IChatMessage>(
  {
    matchId: { type: String, required: true, index: true },
    room: { type: String, required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    userName: { type: String, required: true },
    text: { type: String, required: true, maxlength: 2000 },
    reactions: {
      type: [
        {
          emoji: String,
          userIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const ChatMessage = mongoose.model<IChatMessage>('ChatMessage', chatMessageSchema);

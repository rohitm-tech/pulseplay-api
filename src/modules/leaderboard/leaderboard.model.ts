import mongoose, { Schema, Document, Types } from 'mongoose';

export interface ILeaderboard extends Document {
  userId: Types.ObjectId;
  xp: number;
  correctPredictions: number;
  streak: number;
}

const leaderboardSchema = new Schema<ILeaderboard>(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', unique: true, required: true },
    xp: { type: Number, default: 0 },
    correctPredictions: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
  },
  { timestamps: true }
);

export const Leaderboard = mongoose.model<ILeaderboard>('Leaderboard', leaderboardSchema);

import mongoose, { Schema } from 'mongoose';

export const LIVE_MATCHES_SNAPSHOT_ID = 'live-matches-snapshot';

export interface LiveMatchesDocLean {
  _id: string;
  matches: unknown[];
  updatedAt: Date;
}

const liveMatchesSnapshotSchema = new Schema(
  {
    _id: { type: String, required: true },
    matches: { type: [Schema.Types.Mixed], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'livematchessnapshots' }
);

export const LiveMatchesSnapshot =
  mongoose.models.LiveMatchesSnapshot || mongoose.model('LiveMatchesSnapshot', liveMatchesSnapshotSchema);

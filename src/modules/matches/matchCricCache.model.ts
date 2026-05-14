import mongoose, { Schema } from 'mongoose';

export interface MatchCricCacheLean {
  _id: string;
  summary?: unknown;
  summarySourceAt?: Date;
  commentary?: unknown[];
  commentarySourceAt?: Date;
}

const matchCricCacheSchema = new Schema(
  {
    _id: { type: String, required: true },
    summary: { type: Schema.Types.Mixed },
    summarySourceAt: { type: Date },
    commentary: { type: [Schema.Types.Mixed], default: undefined },
    commentarySourceAt: { type: Date },
  },
  { collection: 'matchcriccaches' }
);

export const MatchCricCache =
  mongoose.models.MatchCricCache || mongoose.model('MatchCricCache', matchCricCacheSchema);

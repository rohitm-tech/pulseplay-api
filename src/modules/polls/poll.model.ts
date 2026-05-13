import mongoose, { Schema, Document, Types } from 'mongoose';

export interface IPoll extends Document {
  question: string;
  options: string[];
  matchId: string;
  expiresAt: Date;
  correctAnswer?: string;
  createdBy?: Types.ObjectId;
  status: 'open' | 'closed';
  votes: { userId: Types.ObjectId; option: string }[];
}

const pollSchema = new Schema<IPoll>(
  {
    question: { type: String, required: true },
    options: { type: [String], required: true },
    matchId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    correctAnswer: { type: String },
    createdBy: { type: Schema.Types.ObjectId, ref: 'User' },
    status: { type: String, enum: ['open', 'closed'], default: 'open' },
    votes: {
      type: [
        {
          userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
          option: { type: String, required: true },
        },
      ],
      default: [],
    },
  },
  { timestamps: true }
);

export const Poll = mongoose.model<IPoll>('Poll', pollSchema);

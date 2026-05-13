import mongoose, { Schema, Document, Types } from 'mongoose';
import bcrypt from 'bcrypt';

export type UserRole = 'user' | 'admin';

export interface INotificationPrefs {
  boundaries: boolean;
  wickets: boolean;
  milestones: boolean;
  polls: boolean;
}

export interface IUser extends Document {
  name: string;
  email: string;
  password: string;
  avatar?: string;
  favoriteTeam?: string;
  favoritePlayers: string[];
  notificationPrefs: INotificationPrefs;
  followingIds: Types.ObjectId[];
  xpPoints: number;
  badges: string[];
  role: UserRole;
  refreshTokenVersion: number;
  correctPredictions: number;
  streak: number;
  isPasswordCorrect(password: string): Promise<boolean>;
}

const userSchema = new Schema<IUser>(
  {
    name: { type: String, required: true, trim: true, maxlength: 120 },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    password: { type: String, required: true, minlength: 8, select: false },
    avatar: { type: String },
    favoriteTeam: { type: String },
    favoritePlayers: { type: [String], default: [] },
    notificationPrefs: {
      type: {
        boundaries: { type: Boolean, default: true },
        wickets: { type: Boolean, default: true },
        milestones: { type: Boolean, default: true },
        polls: { type: Boolean, default: true },
      },
      default: () => ({ boundaries: true, wickets: true, milestones: true, polls: true }),
    },
    followingIds: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    xpPoints: { type: Number, default: 0 },
    badges: { type: [String], default: [] },
    role: { type: String, enum: ['user', 'admin'], default: 'user' },
    refreshTokenVersion: { type: Number, default: 0 },
    correctPredictions: { type: Number, default: 0 },
    streak: { type: Number, default: 0 },
  },
  { timestamps: true }
);

userSchema.pre('save', async function (next) {
  if (!this.isModified('password')) return next();
  this.password = await bcrypt.hash(this.password, 10);
  next();
});

userSchema.methods.isPasswordCorrect = async function (password: string): Promise<boolean> {
  return bcrypt.compare(password, this.password as string);
};

export const User = mongoose.model<IUser>('User', userSchema);

export interface SafeUser {
  id: string;
  name: string;
  email: string;
  avatar?: string;
  favoriteTeam?: string;
  favoritePlayers: string[];
  notificationPrefs: INotificationPrefs;
  followingCount: number;
  fanTier: number;
  xpPoints: number;
  badges: string[];
  role: UserRole;
  correctPredictions: number;
  streak: number;
  createdAt: Date;
}

function fanTierFromXp(xp: number): number {
  if (xp >= 10_000) return 5;
  if (xp >= 2500) return 4;
  if (xp >= 500) return 3;
  if (xp >= 100) return 2;
  return 1;
}

export function toSafeUser(doc: IUser & { _id: Types.ObjectId }): SafeUser {
  const prefs = doc.notificationPrefs ?? {
    boundaries: true,
    wickets: true,
    milestones: true,
    polls: true,
  };
  return {
    id: doc._id.toString(),
    name: doc.name,
    email: doc.email,
    avatar: doc.avatar,
    favoriteTeam: doc.favoriteTeam,
    favoritePlayers: doc.favoritePlayers ?? [],
    notificationPrefs: prefs,
    followingCount: doc.followingIds?.length ?? 0,
    fanTier: fanTierFromXp(doc.xpPoints ?? 0),
    xpPoints: doc.xpPoints,
    badges: doc.badges,
    role: doc.role,
    correctPredictions: doc.correctPredictions,
    streak: doc.streak,
    createdAt: doc.get('createdAt'),
  };
}

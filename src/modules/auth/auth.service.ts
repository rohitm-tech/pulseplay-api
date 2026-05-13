import { z } from 'zod';
import { User, toSafeUser } from '../users/user.model';
import { signAccessToken, signRefreshToken, verifyRefreshToken } from '../../utils/jwt';
import { ApiError } from '../../utils/apiError';
import { Leaderboard } from '../leaderboard/leaderboard.model';

const registerSchema = z.object({
  name: z.string().min(2).max(120),
  email: z.string().email(),
  password: z.string().min(8).max(128),
  favoriteTeam: z.string().max(32).optional(),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
});

export async function registerUser(body: unknown) {
  const data = registerSchema.parse(body);
  const exists = await User.findOne({ email: data.email });
  if (exists) throw new ApiError(409, 'Email already registered');
  const user = await User.create({
    name: data.name,
    email: data.email,
    password: data.password,
    favoriteTeam: data.favoriteTeam,
  });
  await Leaderboard.findOneAndUpdate(
    { userId: user._id },
    { $setOnInsert: { userId: user._id, xp: 0, correctPredictions: 0, streak: 0 } },
    { upsert: true }
  );
  const tokens = issueTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

export async function loginUser(body: unknown) {
  const data = loginSchema.parse(body);
  const user = await User.findOne({ email: data.email }).select('+password');
  if (!user) throw new ApiError(401, 'Invalid credentials');
  const ok = await user.isPasswordCorrect(data.password);
  if (!ok) throw new ApiError(401, 'Invalid credentials');
  const tokens = issueTokens(user);
  return { user: toSafeUser(user), ...tokens };
}

export async function refreshTokens(refreshToken: string) {
  let payload;
  try {
    payload = verifyRefreshToken(refreshToken);
  } catch {
    throw new ApiError(401, 'Invalid refresh token');
  }
  const user = await User.findById(payload.sub);
  if (!user) throw new ApiError(401, 'Invalid refresh token');
  if (user.refreshTokenVersion !== payload.tokenVersion) {
    throw new ApiError(401, 'Refresh token revoked');
  }
  return issueTokens(user);
}

function issueTokens(user: { _id: { toString: () => string }; email: string; role: 'user' | 'admin'; refreshTokenVersion: number }) {
  const accessToken = signAccessToken({
    sub: user._id.toString(),
    email: user.email,
    role: user.role,
  });
  const refreshToken = signRefreshToken({
    sub: user._id.toString(),
    tokenVersion: user.refreshTokenVersion,
  });
  return { accessToken, refreshToken };
}
